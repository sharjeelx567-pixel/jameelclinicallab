# Deployment & Firebase setup

## 1. Firebase project

1. Create a Firebase project and choose a Firestore location close to Pakistan (for example `asia-south1`).
2. **Authentication** → enable *Email/Password*. Disable account creation by users if offered. Accounts are created by admins only.
3. **Firestore** → create the database in production mode. Then deploy the rules and indexes:
   ```bash
   npm i -g firebase-tools && firebase login
   cd firebase && firebase use <project-id>
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
4. **Storage** → create the default bucket.
5. **Service account** (backend only): Project settings → Service accounts → Generate new private key. Store it **outside the repository**, or better, use the runtime's attached service account (Cloud Run, GCE) with `GOOGLE_APPLICATION_CREDENTIALS` unset.
6. **Web app** (frontend): Project settings → Your apps → Web. Copy the public config into the frontend environment.

## 2. Backend

`backend/.env` (see `.env.example`):

```
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://lis.yourlab.pk
DATA_BACKEND=firestore
AUTH_MODE=firebase
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_STORAGE_BUCKET=<project-id>.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json   # or use the attached identity
BRIDGE_TOKEN_HASHES=lab-pc-1:<sha256>
REPORT_VERIFY_BASE_URL=https://lis.yourlab.pk/verify
LAB_TIMEZONE=Asia/Karachi
```

```bash
cd backend && npm ci && npm run build && npm start
npm run bootstrap:admin -- --email admin@yourlab.pk --name "Full Name"   # once, after creating the user in Firebase Auth
```

Run behind HTTPS (Cloud Run, a VM with Nginx and TLS, etc.). Swagger is disabled in production.

## 3. Frontend

`frontend/.env.production`:

```
NEXT_PUBLIC_API_URL=https://api.lis.yourlab.pk/api/v1
NEXT_PUBLIC_AUTH_MODE=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=…
```

```bash
cd frontend && npm ci && npm run build && npm start   # or deploy to Vercel, Cloud Run or Firebase App Hosting
```

Optional: in Firebase Auth → Templates → Password reset, set the action URL to `https://lis.yourlab.pk/reset-password` so reset links open the in-app page.

## 4. Machine bridge (laboratory PC)

```bash
cd machine-bridge && npm ci && npm run build
cp .env.example .env && cp bridge.config.example.json bridge.config.json   # edit both
npm start
```

Run it as a Windows service (for example with NSSM) so it starts at boot. Install the optional `serialport` dependency on PCs with RS-232 analyzers. The health page is at `http://127.0.0.1:4100/health`.

## 5. Go-live checklist

- [ ] `NODE_ENV=production`; the backend starts (it refuses dev modes)
- [ ] Rules and indexes deployed; client reads denied (check in the Rules Playground)
- [ ] First Super Admin bootstrapped; staff accounts created; demo accounts **absent**
- [ ] Laboratory profile, branches, report footer and logo configured
- [ ] Test catalogue, prices and **approved** reference ranges entered by qualified staff
- [ ] Backups and PITR enabled; restore drill done
- [ ] Label and report printing tested on the actual printers
- [ ] Analyzer integration verified per [ANALYZER_INTEGRATION.md](ANALYZER_INTEGRATION.md), or analyzers left in demo or disabled
