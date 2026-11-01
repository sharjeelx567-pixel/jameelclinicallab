# Images on Cloudinary

Cloudinary (free plan) stores and delivers **non-sensitive images only**:

| Category (API) | Cloudinary folder | Who can upload / replace / delete | Limit |
|---|---|---|---|
| `lab_logo` (one) | `laboratory/logo` | `settings.write` | 2 MB |
| `lab_gallery` | `laboratory/gallery` | `settings.write` | 4 MB |
| `staff_profile` (one per person) | `staff/profiles` | `users.manage`, or the staff member for their own photo | 2 MB |
| `doctor_profile` (one per doctor) | `doctors/profiles` | `doctors.write` | 2 MB |
| `website_illustration` | `website/illustrations` | `settings.write` | 4 MB |

Allowed types: PNG, JPEG and WebP, checked from the **file's bytes**, not its name.

> **Patient documents, prescriptions and medical reports are never sent to Cloudinary.** No upload category exists for them, so the API rejects them. Patient attachments stay in private storage and are served only through the authenticated API. Reports are generated as PDFs on demand from their saved records.

## Setup

1. In the Cloudinary console, open **Settings (gear) → API Keys**.
2. Copy the Cloud name, API key and API secret into `backend/.env`. Never put them in the frontend.
   ```
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   CLOUDINARY_FOLDER_PREFIX=          # optional, e.g. jcl-dev to separate environments
   ```
3. Restart the backend. `GET /health` now shows `"mediaConfigured": true`.
4. Run a real check. It uploads one small generated test image, downloads an optimised copy and deletes it again:
   ```
   cd backend && npm run test:cloudinary
   ```

The frontend needs no Cloudinary settings. It only receives the public `secure_url` of each image.

## How it works

- **Uploads:** the browser sends the file to the backend (`POST /api/v1/media/:category`, multipart, with a progress bar). The backend checks sign-in, permission, type and size, then uploads to Cloudinary with the server-side secret.
  - Stored images are capped at 2400 px to save plan credits.
  - Firestore keeps a `mediaAssets` record holding `publicId` and `secureUrl`. A copy of the reference is also kept on the owner: `laboratorySettings.logo`, `doctors.photo` or `users.photo`.
- **Replace:** `PUT /api/v1/media/:id` uploads the new image, updates the record, then deletes the old file. Uploading a new logo or profile photo automatically replaces the previous one.
- **Delete:** `DELETE /api/v1/media/:id` deletes the image from Cloudinary first, then removes the record and its link. If Cloudinary fails, the record is kept, so no file is ever lost track of.
- **Delivery:** the frontend adds `f_auto,q_auto` (WebP/AVIF where the browser supports it), the required width and, for portraits, face-centred cropping.
  - The page security policy allows images only from `res.cloudinary.com`.
  - Report PDFs fetch the logo as PNG.
- **Audit:** every upload, replacement and deletion is recorded in the audit log.

## Free-plan notes

The free plan gives about 25 monthly credits (1 credit ≈ 1 GB storage, 1 GB delivery or 1,000 transformations). When the limit is reached, uploads fail with `MEDIA_QUOTA`; nothing is charged. Check current limits at cloudinary.com/pricing.

The free plan includes no backup and no healthcare data agreement, which is another reason only non-sensitive images go here.
