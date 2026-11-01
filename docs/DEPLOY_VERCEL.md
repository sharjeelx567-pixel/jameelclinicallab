# Deploying on Vercel

The frontend and the backend are deployed as **two Vercel projects** from the same GitHub repository. The machine bridge stays on the laboratory PC.

| Vercel project | Root Directory | What it is |
|---|---|---|
| `jameel-lab-api` (suggested name) | `backend` | NestJS API as one serverless function (`backend/api/index.js`, configured by `backend/vercel.json`) |
| `jameel-lab` (suggested name) | `frontend` | Next.js staff web app |

Deploy the **backend first**, because the frontend needs its address.

## 1. Backend project

1. Vercel → **Add New → Project** → import the repository.
2. Set **Root Directory** to `backend`. Leave Framework as **Other**; build settings come from `backend/vercel.json`.
3. Add the **Environment Variables** below, then click **Deploy**.

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `jameel-clinical-laboratory` |
| `FIREBASE_STORAGE_BUCKET` | `jameel-clinical-laboratory.firebasestorage.app` |
| `FIREBASE_SERVICE_ACCOUNT` | The **entire contents** of the service-account JSON file, pasted as is |
| `CORS_ORIGINS` | The frontend address, e.g. `https://jameel-lab.vercel.app` (comma-separate several) |
| `REPORT_VERIFY_BASE_URL` | `https://<frontend address>/verify` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | From the Cloudinary console |
| `CRON_SECRET` | Any long random string; it enables the daily inventory expiry scan |
| `LAB_TIMEZONE` | `Asia/Karachi` |

Do **not** set `DATA_BACKEND=memory`, `AUTH_MODE=dev` or `SEED_DEMO_DATA`. The production defaults are Firestore and Firebase sign-in, and the server refuses the development modes in production.

**Check it.** Open `https://<backend address>/health/database`. It should show `"ok": true` and `"persistent": true`. This does a real write and read-back on Firestore.

## 2. Frontend project

1. Vercel → **Add New → Project** → import the same repository again.
2. Set **Root Directory** to `frontend` (Next.js is detected).
3. Add these Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend address>/api/v1` |
| `NEXT_PUBLIC_AUTH_MODE` | `firebase` |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._APP_ID` | Same values as in `frontend/.env.local` (public identifiers) |

4. Click **Deploy**. After changing any `NEXT_PUBLIC_*` value, **redeploy**: these values are built into the app.

## 3. Firebase settings

- Go to Authentication → Settings → **Authorized domains** and add the frontend domain (`jameel-lab.vercel.app` and any custom domain). Without this, sign-in is blocked.
- Then go back to the backend project and make sure `CORS_ORIGINS` contains the exact frontend address.

## Serverless notes

- **Uploads:** Vercel limits a request to 4.5 MB, so upload limits are 4 MB (gallery, illustrations, patient attachments) and 2 MB (logo, profile photos).
- **Inventory expiry scan:** runs daily at 04:00 UTC through Vercel Cron (`backend/vercel.json`), authenticated with `CRON_SECRET`. On a normal server it runs on a timer instead.
- **Cold starts:** the first request after a quiet period takes a few seconds while the function starts.
- **Rate limiting:** counted per running instance. For stronger protection, enable Vercel's **Firewall / rate limiting** on the backend project.
- **Machine bridge:** point it at the backend address (`BACKEND_URL=https://<backend address>/api/v1`). Results are pushed over HTTPS, which works with serverless.
