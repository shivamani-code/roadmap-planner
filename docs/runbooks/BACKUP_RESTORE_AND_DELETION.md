# Backup, restore, and deletion recovery

**MVP objective:** RPO ≤24 hours and RTO ≤4 hours. Production uses encrypted managed PostgreSQL backups/PITR; the repository scripts exercise portable logical backup and isolated restore.

## Backup

1. Confirm the destination is encrypted, access-controlled, and outside the database failure domain.
2. Set `DATABASE_URL`, `BACKUP_DIR`, and `BACKUP_ENCRYPTION_AT_REST_ACK=true`.
3. Run `./scripts/backup-postgres.ps1`. Retain the `.dump` and `.sha256` files under immutable retention policy.
4. Replicate `account_deletion_tombstones` to the separately protected deletion ledger after every deletion/recovery change. It is narrowly retained to prevent restored backups from resurrecting deleted accounts.

## Quarterly restore drill

1. Provision an isolated, empty PostgreSQL target with no provider integrations or outbound email.
2. Set `RESTORE_DATABASE_URL`, `BACKUP_FILE`, and `CONFIRM_RESTORE=RESTORE`; run `./scripts/restore-postgres.ps1`.
3. Merge the current external deletion ledger, start the worker once, and verify pending tombstones disable restored accounts before any user traffic. Eligible tombstones must purge; recovered tombstones must not.
4. Run migrations, `pnpm check`, API readiness, representative ownership checks, roadmap reproduction, and row-count/checksum sampling.
5. Record backup time, restore start/end, measured RPO/RTO, tombstones replayed, evidence links, operator, reviewer, and pass/fail. Destroy the isolated target after approval.

Never restore over production directly. A failed drill opens an incident and blocks release.
