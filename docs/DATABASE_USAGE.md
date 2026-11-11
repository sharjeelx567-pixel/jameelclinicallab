# Firestore usage, quota and monitoring

How the backend reads and writes Cloud Firestore, what each screen costs, and how to keep the
laboratory inside the Spark (free) plan: **50,000 document reads, 20,000 writes and 20,000 deletes
per day**. These limits reset at midnight US Pacific time, which is about 1 PM in Pakistan.

## Architecture facts that drive cost

- The browser never touches Firestore. `firebase/firestore.rules` denies every client read and
  write. All access goes through the NestJS backend, which uses the Admin SDK and enforces
  authentication, role permissions and validation itself.
- There are **no `onSnapshot` listeners** anywhere, frontend or backend. "Live" screens use
  polling through `useApi(..., { refreshMs })`, and polling is paused while the browser tab is
  hidden.
- All access goes through `DataStore` (`backend/src/database/`), which offers:
  - `get`: 1 read.
  - `query`: 1 read per document returned.
  - `count` and `sum`: server-side aggregations, costing 1 read per 1,000 index entries.
  - `create`, `set`, `update`, `delete`: 1 write.
  - `transaction`.
- Every authenticated request reads the user's document (1 read), so that a deactivated user
  loses access immediately. The user's role permissions are cached for 15 seconds.

## Collections

| Collection | Purpose | Main reads | Main writes | Growth |
|---|---|---|---|---|
| users, roles | Staff and permissions | Every request (user); roles cached for 15 s | Users page | Small |
| loginActivity | Sign-in history | Profile, staff page (limited) | Each sign-in | 1 per sign-in |
| patients | Patient register | Search/list (paginated), detail | Registration, edit | Per patient |
| doctors | Referring doctors | List (paginated) | Doctors page | Small |
| tests, testCategories | Test catalogue (~850 tests) | **Server memory copy** (see Caching) | Catalogue editor, imports | Fixed |
| catalogIndex/main | All test prices, samples and categories in one document | Registration, billing, analytics (1 read) | Rebuilt after catalogue changes | 1 document |
| catalogIndex/version | Marks when the catalogue changed | 1 read per catalogue use | Every test write | 1 document |
| orders | Orders and billing totals | Lists (paginated), detail | Registration, payments, status | Per visit |
| samples, results, resultVersions | Lab workflow | Per order or result (bounded) | Workflow steps | Per test |
| reports, reportPrints | Issued reports | Per order or patient (limited) | Generate, print | Per report |
| payments | Money in and out (never edited) | Day close, order, patient | Each payment or refund | Per payment |
| monthlyStats | Net revenue of **finished** months | Dashboard (1 read per month) | Once per month, the first time it is needed | 1 per month |
| notifications | Bell | Latest 60, shared for 50 s per server | Workflow events | Per event |
| auditLogs | Immutable audit trail | Audit page (paginated), analytics | Every change | Highest-volume writes |
| inventoryItems, inventoryTransactions | Stock | Inventory pages | Stock movements | Small |
| analyzers, analyzerMessages | Analyzer integration | Analyzer pages (refresh every 60 s) | Bridge messages | Depends on bridge |
| insurancePanels, homeSamplingRequests, mediaAssets, labelPrints | Other modules | Their pages (limited) | Their actions | Small |
| idempotencyKeys | Prevents double-submitted payments and orders | Each protected POST | Each protected POST | 24 h TTL field |
| counters | MR, order, sample and report numbers | Inside transactions | Each new number | Few documents |
| systemHealth/ping | Database health check | Health endpoint | Health endpoint | 1 document |

The composite indexes for every filtered and sorted query are in `firebase/firestore.indexes.json`.
The following queries need only automatic single-field indexes:
- dashboard counts and sums;
- `monthlyStats`;
- the payments of one month;
- results of one test.

The `tests` indexes are no longer used by the list screen, because it filters in memory. They are
kept because removing indexes is not reversible without a redeploy, and they cost nothing.

## Caching (non-patient data only)

| What | Where | Freshness |
|---|---|---|
| All tests | `TestsService.allTests()` (server memory, per process) | Reloaded whenever `catalogIndex/version` changes. Every write to tests moves this marker inside a transaction, so another server's write can never be missed, and other server instances reload on their next request. Tests are never deleted, only made inactive, which is also a write. |
| Latest 60 notifications (full list only) | `NotificationsService` | 50 s. Cleared on new, read or acknowledged notifications on the same server. **This copy is per server process**: Vercel runs several, each with its own copy. Polls do not use it: they ask only for newer notifications. |
| Weekly registration counts | `AnalyticsService` | 2 min |
| Top tests of the last 30 days (test names and counts) | `AnalyticsService` | 15 min |
| Current month's revenue | `AnalyticsService` | 5 min. A finished month is saved to `monthlyStats` 2 hours after it ends, under a fixed document id (`revenue-YYYY-MM`). Two servers saving at once write the same value, never a second total. To recompute a month, delete its document. |
| Analytics for one date range | `AnalyticsService` | 5 min |

Patient records, results, reports and payments are **never** cached. Every request reads them
fresh. The caches live only inside the backend process and are returned only through endpoints
that check permissions first.

## Measured cost of common actions

Measured by `backend/test/read-costs.e2e-spec.ts`, which counts operations the way Firestore bills
them (see the header of that file). Run it against the emulator with `npm run test:e2e:firestore`.
The test fails if any budget is exceeded. These are emulator figures; the real totals are in the
Firebase console.

| Action | Reads | Writes |
|---|---|---|
| Any authenticated request (login check) | 1 (2 for `/auth/me`) | 0 |
| Bell poll every 2 min, nothing new | 2 | 0 |
| Bell poll with new notifications | 2 + 1 per new notification | 0 |
| Bell full list (page load; bell opened at most once a minute; every 30 min) | up to 61; 1 if the same server read it within 50 s | 0 |
| Dashboard, first open / opened again | 64 / 36 | 5 the first time a finished month is saved, then 0 |
| Test catalogue list (catalogue unchanged) | 2 | 0 |
| Edit one test, then list it again | 14, then 2 | 4 |
| Verification queue refresh (empty) | 2 | 0 |
| Public `/health/database` | 1, then 0 for 30 s | 1, then 0 for 30 s |
| One complete patient visit with 2 tests (register, order, samples, results, approval, report, payment) | about 130 (emulator) – 230 (memory store, transactions counted twice) | 52 |

Daily reads per open tab (8 hours visible), not counting page navigation:
- Bell: 240 polls × 2 = 480, plus up to 61 every 30 minutes = about 1,500.
- Before these changes: up to 480 × 201 = 96,000.

Each background tab adds nothing, because polling stops while a tab is hidden. Patient visits are
the main remaining cost. On Spark, assuming about 230 reads per visit plus browsing, plan for about
100–150 visits a day before reaching the 50,000-read limit.

## Errors and their meaning

`common/http-exception.filter.ts` (`databaseProblem`) turns Firestore failures into plain messages
and adds `details.firestoreStatus` for diagnosis. The full error is always written to the server
log.

| Message code | Firestore status | Meaning |
|---|---|---|
| DATABASE_QUOTA_EXCEEDED | `RESOURCE_EXHAUSTED: Quota exceeded` | A quota was used up. On Spark this is the daily one. |
| DATABASE_BUSY | Other `RESOURCE_EXHAUSTED` | Too many requests at once. Not the daily quota. |
| DATABASE_KEY_INVALID | `UNAUTHENTICATED`, `PERMISSION_DENIED`, `invalid_grant` | Wrong or deleted service-account key, or the key lacks Firestore access |
| DATABASE_INDEX_MISSING | `FAILED_PRECONDITION … index` | Indexes not deployed: `firebase deploy --only firestore:indexes` |
| DATABASE_NOT_FOUND | `NOT_FOUND … database` | Wrong `FIREBASE_PROJECT_ID`, or Firestore is not created |
| DATABASE_UNAVAILABLE | `UNAVAILABLE`, `DEADLINE_EXCEEDED` | Temporary outage or network problem |

## Monitoring routine

1. **Daily:** Firebase console → Firestore Database → **Usage**. Look at reads, writes and deletes
   per day against 50k/20k/20k.
2. **When a day is high:** Vercel → backend project → **Logs**. Filter on `failed:` for errors and
   look for request paths that repeat many times.
3. **Alerting:** the Spark plan has no billing alerts. On Blaze, set a budget alert (Google Cloud
   console → Billing → Budgets) at a small amount.
4. Code alone cannot guarantee that the Spark limits are never reached. Usage grows with the
   number of patients, staff and open tabs. A lab working at full volume should move to Blaze: it
   keeps the same free daily amounts and bills only what goes above them.

## Rules for new code

- Never `query` a growing collection without `limit` or a narrow `where`. Use
  `count`/`sum` for statistics.
- Never poll faster than 60 s. Use `useApi(..., { refreshMs })`, which pauses in hidden tabs.
- Read tests through `TestsService.allTests()`. Call `touch()` after any write to `tests`.
- Do not cache patient-identifiable data.
- Saved summaries (such as `monthlyStats`) are only allowed for data that can no longer change.
