# JCL Backend — NestJS REST API

All business rules, authentication and authorisation for JAMEEL CLINICAL LABORATORY. It is the only component holding Firebase Admin credentials.

```bash
npm install
cp .env.example .env          # see comments inside
npm run start:dev             # http://localhost:4000/api/v1  (Swagger: /api/docs outside production)
```

| Script | Purpose |
|---|---|
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` / `npm run lint` | Strict TypeScript / ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | Full workflow tests through HTTP (dev auth + in-memory store) |
| `npm run bootstrap:admin -- --email … --name "…"` | Provision the first Super Admin in a real Firebase project |

Modes (see `.env.example`):

- `DATA_BACKEND=firestore|memory` — `memory` is for development and tests only.
- `AUTH_MODE=firebase|dev` — `dev` is for development and tests only.

Both dev modes are refused when `NODE_ENV=production`.

Versioned routes are under `/api/v1`: `auth`, `users`, `roles`, `patients`, `doctors`, `panels`, `tests`, `orders`, `samples`, `results`, `reports`, `billing`, `home-sampling`, `inventory`, `analyzers`, `notifications`, `analytics`, `audit-logs`, `settings`. `/health` is public.

See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) and [../docs/SECURITY.md](../docs/SECURITY.md).
