# Security & medical-data safety

## Authentication

- Firebase Authentication (email/password). **No public signup.** Accounts are created by an administrator (Staff → Add staff) or, for the first Super Admin, by `npm run bootstrap:admin`.
- The backend verifies every ID token with `verifyIdToken(token, checkRevoked=true)`, so disabled users and revoked sessions are rejected immediately. Disabling a staff account also revokes their refresh tokens.
- The staff profile and role permissions are loaded from Firestore on every request (15-second role cache). Role or permission claims sent by the client are never trusted.
- Sessions use browser-session persistence (closing the browser signs the user out) plus a 30-minute idle logout, which suits shared laboratory PCs.
- Password reset and change use Firebase's flows. Changing a password requires re-authentication.
- `AUTH_MODE=dev` and `DATA_BACKEND=memory` exist for development only and are **refused at startup when `NODE_ENV=production`**.

## Authorisation

- Seven roles map to a permission catalogue (`backend/src/common/permissions.ts`). Super Admins can reconfigure the matrix. Super Admin can never lose `users.manage` or `roles.manage`, which prevents lock-out.
- Every endpoint declares `@RequirePermissions(...)`. Hiding something in the UI is only a convenience.
- Clinical safeguards are enforced server-side:
  - results can be approved only from `submitted` status;
  - the person who entered a result cannot approve it (configurable, on by default);
  - approved results change only through an audited amendment with a reason;
  - reports are generated only from approved results;
  - payments cannot exceed the balance, and refunds cannot exceed the net paid amount;
  - discounts require a permission and are capped by a configurable percentage.

## Data protection

- The browser never reads or writes Firestore or Storage (rules deny all). All data flows through the authorised API.
- Uploads are limited by size, MIME type **and** file signature (magic bytes). Patient attachments are stored privately, with no public URLs.
- Non-sensitive images (logo, gallery, staff/doctor photos, website art) go to Cloudinary and are publicly viewable by link.
  - The API secret stays in `backend/.env`. Uploads are signed server-side after permission checks.
  - The API has no upload category for patient documents or reports, so those can never be sent there. See [IMAGES_CLOUDINARY.md](IMAGES_CLOUDINARY.md).
- Application logs record method, route, status, duration and user ID only. They contain no request bodies, patient identifiers or result values. The machine bridge logs hashes and counts, never raw messages.
- Error responses to clients are generic for unexpected failures. Stack traces stay on the server.
- Notifications reference order and sample numbers, not patient names, and are filtered by role.
- The public report verification endpoint is rate-limited. It returns only report number, status, date, patient initials and a masked MR number. No results.
- CSV exports neutralise spreadsheet formula injection.
- HTTP hardening: Helmet on the API; CSP, `X-Frame-Options: DENY`, `nosniff` and a referrer policy on the frontend. CORS allows configured origins only. Global rate limiting applies.

## Audit trail

`auditLogs` is append-only from the application. It has no update or delete endpoint, and Firestore rules deny client writes. It records:

- logins and logouts;
- patient create, update and archive (with field-level diffs);
- orders, cancellations and discounts;
- sample transitions;
- result save, submit, approve, reject and amend;
- report generation and every print or download;
- payments and refunds;
- inventory movements;
- user, role and permission changes;
- analyzer configuration and manual matching;
- settings changes.

Audit writes for critical workflows happen inside the same transaction as the change.

For tamper-evidence beyond application controls, export audit logs regularly to write-once storage (see [Backup & recovery](BACKUP_AND_RECOVERY.md)).

## Medical content

- The software **does not invent reference ranges, results or diagnoses.** It ships with no clinical reference values. Ranges are entered by the laboratory, stay as `draft` until approved by a user with `tests.approveRanges`, and only approved ranges are used for flagging or printing. When no approved range applies, the result is flagged `no_range` and printed as "Not established".
- Analyzer results are never auto-approved. They arrive as drafts and go through the same submit → verify workflow.
- Critical values are highlighted during entry and verification, and raise a notification after verification. That notification has an acknowledgement step (who informed the clinician, and when) within a configurable escalation window.

## Not covered (requires an external assessment)

No claim is made of compliance with ISO 15189, CAP, HIPAA, GDPR or Pakistani data-protection law. Before go-live:

- carry out a formal risk assessment and validation (including verification of every analyzer interface);
- run a penetration test;
- agree data-processing terms with Google Cloud;
- write documented SOPs.
