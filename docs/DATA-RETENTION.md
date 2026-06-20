# Data Retention Policy

Status: approved on 2026-06-20.

## Legal basis

- The Romanian Dental Code, Article 35, requires medical documents to be archived for
  five years from the last contact with the patient unless another law requires a longer
  term. Destruction after that period must use secure methods and be recorded.
- GDPR Article 5 requires storage limitation. Article 17 preserves records required by a
  legal obligation, public-health grounds, or the establishment or defence of legal claims.

Sources:

- https://legislatie.just.ro/Public/DetaliiDocument/245940
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02016R0679-20160504

## Approved rules

| Data | Retention and deletion rule |
| --- | --- |
| Active patient records | Never deleted automatically; stale records require clinic review. |
| Soft-deleted patient records | Eligible after five years from the latest clinical contact and at least 30 days after soft deletion. |
| Patient legal hold | `retention_legal_hold: true` always excludes the patient from automated deletion. |
| Public treatment-plan links | Existing 30-day expiry and MongoDB TTL cleanup. |
| Patient data-access logs | Five years, enforced through `expires_at_date` TTL. |
| GDPR erasure tombstones | Five years; tombstones contain no patient identifier. |
| Retention run summaries | One year; summaries contain counts and cutoffs, not patient identifiers. |
| Unreferenced R2 objects | Eligible after 30 days, only under `tenants/`, after checking every known DB reference. |

The last-contact calculation checks patient activity fields plus appointments,
conversations, notes, files, dental events, surgery/bridge groups, and treatment plans.
The five-year minimum and 30-day grace cannot be reduced through environment values.

## Runtime controls

The daily Vercel cron calls `GET /api/cron/data-retention` with `CRON_SECRET`.

```text
GDPR_RETENTION_ENABLED=true
GDPR_RETENTION_EXECUTE=false
GDPR_CLINICAL_RETENTION_YEARS=5
GDPR_DELETE_GRACE_DAYS=30
GDPR_RETENTION_BATCH_SIZE=25
GDPR_ORPHAN_CLEANUP_ENABLED=true
GDPR_ORPHAN_SCAN_LIMIT=250
```

`GDPR_RETENTION_EXECUTE=false` is the default and performs a dry-run. Enable execution
only after reviewing dry-run summaries. Patient deletion and orphan-file deletion use the
same switch. Keep the orphan cleanup disabled until R2 listing permissions are verified.

## Deployment

1. Apply `migrations/012_data_retention.js`. It backfills five-year expiry dates on audit
   records and creates TTL/candidate indexes.
2. Deploy with retention enabled and execution disabled.
3. Review `retention_runs` and application logs for at least one scheduled run.
4. Enable orphan scanning in dry-run and verify the candidate count.
5. Set `GDPR_RETENTION_EXECUTE=true` after the dry-run is accepted.

Every executed patient purge uses the same tested cascade as a manual GDPR erasure. R2
objects are deleted first; if any storage deletion fails, the database records remain.
