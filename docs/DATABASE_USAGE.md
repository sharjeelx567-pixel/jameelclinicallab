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
- Login check: a request that only reads data reuses the user's profile and role for up to 60 s.
  A request that changes data always re-reads the profile, and uses role permissions at most
  15 s old. A disabled account is refused immediately in both cases, because Firebase
  Authentication checks it on every request (`verifyIdToken(token, true)`).

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
| Login profile and role | `AccessService` (per process) | 60 s for requests that only read; changes always re-read the profile (roles at most 15 s old) |
| Lab settings | `SettingsService.get()` (per process) | 60 s; replaced at once on save; cleared when the logo changes |
| Active doctor list (Register page) | `DoctorsService.list` (per process) | Reloaded when `counters/doctorsVersion` changes (any doctor create, edit or photo change) |
| Test categories | `TestsService.categories()` (per process) | Same version marker as the tests |
| Dashboard | `AnalyticsService.dashboard` (per process) | 30 s, shared only between users with an identical permission set |

Patient records, results, reports and payments are **never** cached, apart from the dashboard's six most recent patients and orders (30 s, same-permission users only). Every request reads them
fresh. The caches live only inside the backend process and are returned only through endpoints
that check permissions first.

## Measured cost of common actions

All figures are document reads/writes **as Firestore bills them**, measured on the Firestore
emulator by `backend/test/read-costs.e2e-spec.ts` (`npm run test:e2e:firestore`; add
`READ_DETAIL=1` to print the per-collection breakdown). The test fails if a budget is exceeded.
They are emulator figures — real daily totals are in Firebase console → Firestore → Usage.
(The in-memory test store counts transaction reads twice, so its totals are higher.)

### One complete patient visit (2 tests: register → order → 2 tubes collected/received/accepted → 2 results entered → approved → report → payment)

| Step | Start (12 Nov) | Phase 1 | **Phase 2 (now)** | Writes now |
|---|---|---|---|---|
| Register patient | 3 | 3 | **3** | 3 |
| Create order (2 tests) | 8 | 7 | **6** | 8 |
| Collect + receive + accept 2 samples (6 clicks) | 48 | 42 | **18** | 18 |
| Enter + submit 2 results | 22 | 20 | **12** | 10 |
| Approve 2 results | 22 | 16 | **8** | 10 |
| Generate report | 22 | 11 | **10** | 3 |
| Take payment | 4 | 4 | **4** | 6 |
| **Whole visit** | **129** | **103** | **61** | 58 (was 52) |

### Exact reads of the visit now (61)

| Collection | Reads | Why it is needed |
|---|---|---|
| users | 14 | Fresh profile check on each of the 14 data-changing requests (security: never cached for writes) |
| orders | 12 | The order inside each transaction (status, billing, items) |
| samples | 12 | The tube being moved (6 clicks), checked fresh for each transition; the tube of each result |
| results | 6 | The result being entered/approved; the order's results for the report |
| counters | 6 | Sequential numbers, read and incremented atomically (MR, order, sample, report and receipt numbers) |
| patients | 5 | Patient for duplicate check / order / result flagging (age, gender) / report |
| catalogIndex | 2 | Catalogue version marker (order prices, report) |
| tests | 2 | Parameters and ranges of each test when a result is entered (always fresh) |
| reports, idempotencyKeys | 2 | Previous report versions; double-submit protection for the payment |

Per sample click: **3 reads** (profile, sample, order). Per result entry: 6. Per approval: 4.

### Other actions

| Action | Start | Now |
|---|---|---|
| Any screen load (login check) | 1 | 0 (profile reused ≤ 60 s for reads) |
| Bell poll, nothing new | 2 | 1 |
| Dashboard first open / again within 30 s | 63 / 37 | 62 / 0 |
| Register & bill page data | 2 + up to 100 doctors | 2 (3 after a doctor changes) |
| Test catalogue list (865 tests) | 2 | 1 |
| Verification queue refresh (empty) | 2 | 1 |

No duplicate requests: a browser check of every main screen shows each screen loads its own
data once; moving between screens loads only that screen's data.

## Phase 2: order status summary (denormalisation)

**Problem found:** 56 of the 103 reads of a visit were the order's *samples and results* being
re-read on every sample click, result entry and approval — only to recompute the order status
(`deriveOrderStatus`).

**Change:** each order item now carries `sampleStatus` and `resultStatus` (see `OrderItem` in
`common/entities.ts`). `OrdersService.statusBase` gives the statuses from the order itself (no
reads) and `OrdersService.statusPatch` returns the updated summary + order status.

**Update strategy (why it cannot drift):**
- It is written **in the same Firestore transaction** as every status change: order creation,
  sample collect/receive/accept/reject, result entry, analyzer import, correction request,
  approval and amendment. Firestore retries a transaction if the order changed meanwhile.
- A sample rejection (which moves tests to a replacement tube) sets the moved items to the new
  tube's status in its transaction and then `syncStatus` rebuilds the whole summary from the
  real documents.
- Orders created before this change have no summary: the first status change reads the
  samples/results once (old behaviour) and writes the summary. No migration needed.
- An end-to-end test checks, for every order, that the summary equals the real sample and
  result documents and that the order status equals the status derived from them, including
  rejection, correction and an order whose summary was removed.

**Not trusted for critical decisions:** a sample transition always reads the sample itself
(fresh, in the transaction) to check the transition is allowed; result entry/approval read the
result, its sample and test fresh; a sample is marked completed only after reading it fresh.
The summary only replaces reading the *other* tubes and results of the order.

**Other phase-2 changes:** order creation takes test prices from the catalogue copy (1 read
instead of 1 per test); first-time approvals skip the result-version lookup (versions exist only
after an amendment); report generation checks the catalogue version once.

**Trade-off:** +1 write per sample click (the order summary), i.e. 58 instead of 52 writes per
visit. Writes are far from their limit (20,000/day; a visit uses 58), reads were the problem.

## Remaining reads and why they stay

- **Profile check on writes (14 per visit):** removing it would let a user whose role was just
  removed keep changing data for up to a minute.
- **The document being changed** (sample, result, order) is always read inside its transaction —
  required for correctness (status checks, concurrent edits).
- **Number counters** (MR/order/sample/report/receipt) must be read and incremented atomically.
- **Patient and test** documents for flagging use the current approved reference ranges and the
  patient's age/gender.
- **Dashboard first open (62)**: counts are aggregations (1 read each); recent patients/orders
  and today's/current month's payments are read; past months come from `monthlyStats`.

Further reductions would need architectural changes with real trade-offs (e.g. trusting cached
profiles for writes, or moving counters to a sharded scheme) and are not recommended.

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
