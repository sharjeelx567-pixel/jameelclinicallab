# Backup & recovery

All clinical data lives in Cloud Firestore and Firebase Storage. Backups are configured in Google Cloud, not in the application.

## Recommended configuration

1. **Point-in-time recovery (PITR)** for Firestore lets you read any moment in the last 7 days:
   ```bash
   gcloud firestore databases update --database='(default)' --enable-pitr
   ```
2. **Scheduled daily backups** with a retention that matches the laboratory's record-keeping policy (Settings → System records the target in years):
   ```bash
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w
   ```
3. **Monthly long-term exports** to a dedicated bucket with Object Versioning and a retention lock. This gives write-once retention for audit logs and reports:
   ```bash
   gcloud firestore export gs://<lab-backup-bucket>/$(date +%Y-%m)
   ```
4. **Storage**: enable Object Versioning on the Firebase Storage bucket, and replicate it to the backup bucket with Storage Transfer Service.
5. Restrict backup-bucket IAM to two named administrators. Enable Cloud Audit Logs for data access.

## Restore procedure

1. Restore into a **new** database first. Never overwrite production directly:
   ```bash
   gcloud firestore databases restore --source-backup=<backup-name> --destination-database=restore-check
   ```
2. Point a staging backend at `restore-check` and verify:
   - patient counts;
   - the latest orders and reports;
   - that audit logs are present;
   - that a known report renders with the same verification code.
3. Schedule downtime, then switch production (or copy the specific collections back) under change control. Record the event.
4. Analyzer messages queued on the bridge PC during the outage are retained on disk (`machine-bridge/data/queue`) and resent automatically. Duplicate messages are ignored by hash.

## Restore drill

Run a restore drill every quarter. Record the date, the backup used, the time taken and the checks passed.

## Machine-bridge PC

The bridge's queue directory holds undelivered messages. Include `machine-bridge/data/` in the PC's local backup. The `failed/` folder holds messages the backend permanently rejected, for review.
