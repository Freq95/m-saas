# Benchmark Summary

- Run ID: `20260220-205317`
- Timestamp: `2026-02-20T20:53:17.707Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 926.09 | 451.68 | 21.85 | 100 |
| api.appointments.range | medium | GET | 2955.38 | 2124.07 | 21.64 | 100 |
| api.clients.list | light | GET | 697.83 | 194.76 | 49.54 | 0 |
| api.clients.list | medium | GET | 1924.17 | 1171.74 | 38.68 | 0 |
| api.services.list | light | GET | 806.56 | 280.69 | 34.82 | 100 |
| api.services.list | medium | GET | 2004.36 | 1540.18 | 30.42 | 100 |
| api.dashboard.7d | light | GET | 742.1 | 187.3 | 51.87 | 0 |
| api.dashboard.7d | medium | GET | 1945.03 | 1058.99 | 44.2 | 0 |
| api.providers.list | light | GET | 827.22 | 299.38 | 29.13 | 100 |
| api.providers.list | medium | GET | 2012.56 | 1416.51 | 33.02 | 100 |
| api.resources.list | light | GET | 823.79 | 282.81 | 34.65 | 100 |
| api.resources.list | medium | GET | 2000.29 | 1420.57 | 33.85 | 100 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 928.44 | 544.97 | 17.54 | 0 |
| api.clients.create | medium | POST | 2939.9 | 2066.65 | 23.17 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 991.15 | 569.78 | 17.4 | 0 |
| ui.dashboard | medium | GET | 3043.74 | 2785.89 | 16.73 | 0 |
| ui.clients | light | GET | 24.55 | 22.25 | 440.91 | 0 |
| ui.clients | medium | GET | 122.41 | 106.67 | 452.34 | 0 |
| ui.calendar | light | GET | 645.41 | 192.57 | 51.76 | 100 |
| ui.calendar | medium | GET | 1028.58 | 949.77 | 51.11 | 100 |
| ui.inbox | light | GET | 170.54 | 120.8 | 82.43 | 100 |
| ui.inbox | medium | GET | 618.95 | 411.32 | 115.75 | 100 |
| ui.settings.email | light | GET | 107.91 | 96.89 | 102.51 | 0 |
| ui.settings.email | medium | GET | 712.04 | 366.89 | 131.42 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":967.15,"secondInviteStatus":403,"secondInviteMs":111.77} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":498.94,"removeStatus":200,"acceptStatus":409,"acceptMs":76.17} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":47.56},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":36.36},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":44.18}]} |

