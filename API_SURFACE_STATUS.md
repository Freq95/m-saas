# API Surface Status

Scope: classification for cleanup of endpoints with unclear product ownership.

## Classified Endpoints
| Endpoint | Status | Rationale |
|---|---|---|
| `app/api/providers/route.ts` | `feature-flagged` | Advanced scheduling capability, not required by core dashboard/inbox/clients flows. |
| `app/api/resources/route.ts` | `feature-flagged` | Advanced scheduling capability, not required by core dashboard/inbox/clients flows. |
| `app/api/waitlist/route.ts` | `feature-flagged` | Advanced scheduling capability, no core UI dependency. |
| `app/api/blocked-times/route.ts` | `feature-flagged` | Advanced scheduling capability, no core UI dependency. |
| `app/api/appointments/recurring/route.ts` | `feature-flagged` | Advanced scheduling capability, no core UI dependency. |

## Isolation Decision
- No endpoint in this set is removed in this cleanup pass.
- Isolation is by scope contract: these routes are treated as non-core advanced scheduling APIs and are excluded from the minimal maintained API docs surface.

