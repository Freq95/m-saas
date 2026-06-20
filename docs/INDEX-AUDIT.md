# MongoDB Hot Query Index Map

This audit covers the production hot paths in the dashboard, patient profile, dental chart,
treatment plans, public links, and patient files. All index keys begin with the tenant/scope
fields used by the query unless the lookup is intentionally global (the hashed public token).

| Query path | Backing index |
| --- | --- |
| Dashboard appointments by owner and time range | appointments_scope_time |
| Dashboard appointments by calendar and time range | appointments_calendar_time |
| Patient profile appointments (owner branch) | appointments_client_owner_recent |
| Patient profile appointments (service-owner branch) | appointments_client_service_owner_recent |
| Patient list default activity sort | clients_scope_last_activity |
| Dashboard top patients | clients_scope_total_spent |
| Patient growth/new-patient ranges | clients_scope_created |
| Tenant patient point lookup | clients_scope_id |
| Patient conversations ordered by update | conversations_client_recent |
| Dental snapshot by patient | tooth_states_scope_client |
| Latest dental event per tooth aggregation | tooth_events_client_latest |
| Recompute one tooth from event history | tooth_events_tooth_latest |
| Surgical and bridge groups by patient | surgery_groups_scope_recent / bridge_groups_scope_recent |
| Treatment-plan list and point lookup | treatment_plans_scope_recent / treatment_plans_scope_id |
| Patient-file list and point lookup | client_files_client_recent / client_files_client_id |
| Legacy contact-file fallback list and point lookup | contact_files_contact_recent / contact_files_contact_id |
| Public treatment-plan token lookup | treatment_plan_public_links_token_hash (unique) |
| Active share link by plan | treatment_plan_public_links_by_plan_active |
| Expired share cleanup | treatment_plan_public_links_expires_at_ttl (TTL) |

## Explain evidence

Verified against the configured Atlas database on 2026-06-20 after migration 011:

| Audited query | Winning index | Returned | Keys examined | Documents examined |
| --- | --- | ---: | ---: | ---: |
| Dashboard appointments by owner/time | appointments_scope_time | 20 | 20 | 20 |
| Dashboard appointments by calendar/time | appointments_calendar_time | 20 | 20 | 20 |
| Patient list default sort | clients_scope_last_activity | 20 | 20 | 20 |
| Latest dental event per tooth | tooth_events_client_latest | 12 | 22 | 22 |
| Treatment plans recent list | treatment_plans_scope_recent | 2 | 2 | 2 |
| Patient files recent list | tenant_id_1_client_id_1_created_at_-1 | 11 | 11 | 11 |

No audited winning plan used `COLLSCAN`. The patient-files index predates migration 011
and has MongoDB's generated name; migration 011 detects equivalent key specifications so
it remains idempotent without replacing that index.

After applying migration 011, run:

    npx tsx scripts/audit-hot-indexes.ts

The script fails if an expected index is absent, uses an explicit hint for every audited hot
query, and emits only planner statistics and index names. It never prints tenant, patient,
appointment, or treatment data.
