# Architecture

```
 Browser (staff)                         Laboratory PC
 ┌──────────────────────┐                ┌──────────────────────────┐
 │ frontend (Next.js)   │                │ machine-bridge (Node)    │
 │ • UI, forms, print   │                │ • TCP / RS-232 connector │
 │ • Firebase Web Auth  │                │ • ASTM / HL7 framing     │
 │   (sign-in only)     │                │ • durable disk queue     │
 └─────────┬────────────┘                └──────────┬───────────────┘
           │ HTTPS REST + Firebase ID token          │ HTTPS REST + bridge token
           ▼                                         ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ backend (NestJS) /api/v1                                         │
 │ AuthGuard → PermissionsGuard → Zod validation → Service → Store  │
 │ Audit trail · notifications · PDF rendering · rate limiting      │
 └─────────┬───────────────────────────────────────┬───────────────┘
           │ Firebase Admin SDK                    │
           ▼                                       ▼
   Cloud Firestore                         Firebase Storage
   (rules: deny all clients)               (rules: deny all clients)
```

## Principles

- **The server owns every rule.** Prices, discounts, balances, order and sample status, result flags, approval and report status are computed in the backend. The frontend never sends them, and the backend ignores them if it does.
- **The client never touches the database.** Firestore and Storage rules deny all client access. Only the backend (Admin SDK) reads and writes.
- **Status is derived, not stored blindly.** Order status is re-derived from samples, results and billing after every change (`orders/order-status.ts`).
- **Atomic workflows.** Order creation (order, samples, results, payment, counters, audit), payments, approvals, amendments and stock movements each run in a single Firestore transaction. All reads happen before writes, as Firestore requires.
- **Immutable clinical history.** Approved results are snapshotted in `resultVersions`. Reports store a frozen snapshot, so a reprint matches the original exactly. An amendment creates a new version and supersedes earlier reports. Nothing is silently overwritten.
- **Honest integration state.** Analyzer `connectionState` is written only from live bridge heartbeats and goes stale after 2 minutes. Demo traffic is flagged end-to-end and never applied to patients.

## Backend layout (`backend/src`)

| Folder | Purpose |
|---|---|
| `config/` | Zod-validated environment; refuses dev modes in production |
| `database/` | `DataStore` abstraction: `FirestoreDataStore` (production) and `MemoryDataStore` (dev/test only); dev seed |
| `firebase/` | The only place Admin credentials are used |
| `guards/` | `AuthGuard` (token verification, staff lookup, permissions), `BridgeGuard` (device token) |
| `common/` | Entities, permission catalogue, errors, Zod pipe, exception filter |
| `interceptors/` | Response envelope `{ success, data }` and request logging (no bodies, no PHI) |
| `modules/*` | One module per domain: auth, users, patients, doctors, panels, tests, orders, samples, results, reports, billing, home-sampling, inventory, analyzers, notifications, analytics, audit-logs, settings |

API responses are `{ success: true, data }` on success and `{ success: false, error: { code, message, details? } }` on failure. Interactive OpenAPI docs are at `/api/docs` (non-production).

## Frontend layout (`frontend/src`)

| Folder | Purpose |
|---|---|
| `app/(public)` | Login, forgot/reset password, unauthorized, public report verification |
| `app/(app)` | Protected pages (one folder per module) inside the app shell |
| `components/ui` | Design-system primitives (button, inputs, dialog/drawer, tabs, badge…) |
| `components/shared` | Data table, states (empty/error/loading), status badges, barcode/QR, dialogs |
| `components/{layout,dashboard,patients,laboratory,reports}` | Feature components |
| `features/auth` | Auth provider (Firebase or dev), idle timeout, session handling |
| `services/` | Typed API calls. Components never call `fetch` directly |
| `lib/` | API client, Firebase web init, utilities, CSV export, flag preview |

Design tokens (colours, radius, shadows, typography) live in `src/styles/globals.css` and `tailwind.config.ts`, with light and dark themes. Print rules (A4, page breaks, repeating table headers) are in the same stylesheet.

## Machine bridge (`machine-bridge/src`)

`connectors/` (TCP server or client, serial) → `protocols/astm-framing.ts` (ENQ/STX/ETX/checksum/ACK) or HL7 MLLP → `parsers/` (ASTM E1394 records, HL7 OBR/OBX) → `queue/file-queue.ts` (atomic files, dedupe by SHA-256, backoff) → `services/backend-client.ts` → backend `/analyzers/bridge/messages`. A local status endpoint is exposed on `127.0.0.1:4100/health`.
