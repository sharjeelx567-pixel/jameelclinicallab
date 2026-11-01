# Testing

| Suite | Command | Covers |
|---|---|---|
| Backend unit | `cd backend && npm test` | Reference-range selection and flagging (draft ranges ignored, age/sex specificity, critical limits), order-status derivation, server-side pricing (panel rates, discount eligibility), input sanitisation, PATCH schemas that don't reset defaults, lab time-zone day boundaries |
| Backend e2e | `cd backend && npm run test:e2e` | The full HTTP pipeline using dev auth and the in-memory store. See the list below |
| Machine bridge | `cd machine-bridge && npm test` | ASTM checksum, framing (ACK/NAK, split TCP chunks, multi-frame), record parsing and error reporting; HL7 parsing, MLLP and ACK; durable queue dedupe, backoff and failed folder; config safety; a real TCP round-trip through the ASTM driver |
| Frontend unit/component | `cd frontend && npm test` | Flag preview, CSV injection safety, patient form validation and payload mapping, data table (pagination, search, sort, empty state), accessible field errors, error states (403 vs retry), status badges |
| Responsive & smoke | `cd frontend && npm run test:responsive` | With both servers running in dev mode: seeds a fictional workflow, then loads 32 pages at 1920, 1600, 1440, 1366, 1280, 1024, 768, 430, 390, 375 and 360 px. Fails on page-level horizontal overflow, elements outside the viewport (excluding intentional scroll containers), or console/page errors. Also opens the mobile navigation drawer. Add `--screenshots` to save PNGs under `frontend/test-results/responsive` |

The backend end-to-end suite covers:

- missing, invalid or unprovisioned tokens;
- permission denials;
- range approval;
- patient registration with MR number;
- validation errors;
- duplicate detection and reviewed override;
- search;
- discount permission;
- multi-test order with server pricing and sample grouping;
- result entry blocked before the sample is accepted;
- sample transitions and invalid transitions;
- server flagging, including critical values;
- incomplete-submit rejection;
- no report from unverified results;
- unauthorised approval and self-verification blocked;
- role-aware critical notifications without PHI;
- final report, PDF and duplicate-issue refusal;
- report access control;
- public verification without results;
- over-payment and over-refund rejection;
- daily summary;
- patient history;
- amendment with version preservation and report supersession;
- the audit trail;
- bridge authentication, demo isolation and duplicate messages;
- live analyzer messages applied as drafts only;
- demo analyzers not reported as connected and not markable as verified.

## Not covered by automated tests

- Live Firebase (Auth token verification, Firestore transactions and indexes, Storage). The `FirestoreDataStore` implements the same interface but has only been exercised through type checks. Run the e2e suite against the Firebase Emulator Suite, or a staging project, before go-live.
- Physical printers and label printers.
- Any real BIOELAB analyzer.
