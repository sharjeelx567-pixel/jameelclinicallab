# JAMEEL CLINICAL LABORATORY — Laboratory Information System

*Accurate Diagnosis, Better Healthcare*

A private laboratory information system (LIS/LIMS) for the authorised staff of JAMEEL CLINICAL LABORATORY. It covers patient registration, orders, samples, results, verification, reports, billing, inventory, analyzers, audit and administration.

```
.
├── frontend/         Next.js 15 (App Router) staff web app — UI only, talks to the API over REST
├── backend/          NestJS 11 REST API — all business rules, auth, Firebase Admin SDK
├── machine-bridge/   On-premise Node service: analyzer ↔ LIS (ASTM / HL7 over TCP or RS-232)
├── firebase/         Firestore & Storage security rules, composite indexes, emulator config
└── docs/             Architecture, data model, security, analyzer integration, backup, deployment, admin guide
```

The three applications are independent: separate `package.json`, dependencies, environment files and build outputs. Firebase Admin credentials exist **only** in `backend/`.

## Quick start (local development, no Firebase needed)

Requires Node.js 20+ (tested on Node 24).

```bash
# 1. Backend — in-memory data, demo sign-in, demo seed (DEVELOPMENT ONLY)
cd backend
npm install
cp .env.example .env    # then set: DATA_BACKEND=memory  AUTH_MODE=dev  SEED_DEMO_DATA=true
npm run start:dev       # http://localhost:4000/api/v1  · Swagger: http://localhost:4000/api/docs

# 2. Frontend
cd ../frontend
npm install
cp .env.example .env.local   # then set: NEXT_PUBLIC_AUTH_MODE=dev
npm run dev                  # http://localhost:3000
```

Sign in with any seeded **DEMO** role account. A yellow banner marks every page while development mode is active. Development mode is **refused** by the backend when `NODE_ENV=production`.

The dev seed creates demo staff, the test *catalogue structure* (categories, a few tests with parameter names and units) and one DEMO analyzer. It deliberately creates **no patients or results** and **no reference ranges or prices**. Ranges must be entered by the laboratory and approved by a qualified professional.

For production with Firebase, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Implementation status

| Area | Status |
|---|---|
| Frontend / backend / machine-bridge separation | ✅ Implemented |
| Auth (Firebase ID-token verification, revocation check, idle logout, no public signup) | ✅ Implemented · needs your Firebase project |
| Role-based permissions (7 roles, configurable matrix, enforced server-side) | ✅ Implemented & tested |
| Patients (auto MR number, duplicate detection, search, history, audit, archive) | ✅ Implemented & tested |
| Doctors, panels / insurance, home sampling | ✅ Implemented |
| Test catalogue (parameters, age/sex ranges, critical limits, **range approval workflow**) | ✅ Implemented & tested |
| Orders (server-side pricing, panel rates, discount limits, advance payment) | ✅ Implemented & tested |
| Samples (barcodes, collect/receive/accept/reject + automatic recollection, timeline, labels) | ✅ Implemented & tested |
| Results (manual entry, server flagging, critical values, verification, self-verification block, versioning, amendments) | ✅ Implemented & tested |
| Reports (immutable snapshots, versioning, A4 preview & print, PDF, QR verification, reprint log) | ✅ Implemented & tested |
| Billing (payments, refunds, daily cash summary, outstanding, invoices) | ✅ Implemented & tested |
| Inventory (stock ledger, low-stock & expiry alerts) | ✅ Implemented |
| Notifications (role-aware, critical-result acknowledgement) | ✅ Implemented & tested |
| Analytics & CSV export, audit logs | ✅ Implemented |
| Machine bridge (ASTM framing/parser, HL7/MLLP, TCP & serial, durable queue, retries, health) | ✅ Implemented & tested with synthetic messages |
| **BIOELAB analyzer connection** | ⏳ **Not connected.** Exact model and interface documentation are required. See [docs/ANALYZER_INTEGRATION.md](docs/ANALYZER_INTEGRATION.md) |
| Firestore integration | ✅ Every module persists through `FirestoreDataStore`. The workflow suite (39 tests) passes against the Firestore emulator, and a write → **backend restart** → read-back test confirms records survive. `GET /health/database` does a real write + read · rules deployed · ⏳ 2 new `mediaAssets` indexes not yet deployed · ⏳ backend needs a service-account key to use the **live** database (it runs `DATA_BACKEND=memory` until then, which is why records disappear on restart) |
| Duplicate-safe saves | ✅ `Idempotency-Key` on patient, order, payment, refund, inventory and home-sampling creation (retries and double clicks save once) |
| Firebase Storage uploads (logo, patient attachments) | ✅ Implemented · ⏳ Storage not yet enabled in the Firebase console |
| Images on Cloudinary (logo, gallery, staff/doctor photos, website art; never patient data) | ✅ Completed and tested against the live Cloudinary account (upload, replace, delete, optimised delivery, permissions). Re-check any time with `npm run test:cloudinary`. See [docs/IMAGES_CLOUDINARY.md](docs/IMAGES_CLOUDINARY.md) |
| Theming (colours, fonts, default mode in 3 files) | ✅ See [docs/THEMING.md](docs/THEMING.md) |
| Responsive layout (11 viewport widths, 32 pages) | ✅ Tested automatically, see [docs/TESTING.md](docs/TESTING.md) |
| Regulatory compliance (e.g. ISO 15189, data-protection law) | ❌ **Not assessed.** The software supports good practice but makes no compliance claim |

## Verification commands

```bash
cd backend        && npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
cd machine-bridge && npm run typecheck && npm run lint && npm test && npm run build
cd frontend       && npm run typecheck && npm run lint && npm test && npm run build
# with both servers running in dev mode:
cd frontend       && npm run test:responsive
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data model & indexes](docs/DATA_MODEL.md)
- [Security & medical-data safety](docs/SECURITY.md)
- [Analyzer integration checklist](docs/ANALYZER_INTEGRATION.md)
- [Backup & recovery](docs/BACKUP_AND_RECOVERY.md)
- [Deployment & Firebase setup](docs/DEPLOYMENT.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [Testing](docs/TESTING.md)
- [Images on Cloudinary](docs/IMAGES_CLOUDINARY.md)
