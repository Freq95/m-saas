# Benchmark Summary

- Run ID: `20260220-085452`
- Timestamp: `2026-02-20T08:54:52.385Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 26.88 | 23.32 | 419.07 | 100 |
| api.appointments.range | medium | GET | 115.03 | 101.39 | 470.47 | 100 |
| api.clients.list | light | GET | 29.41 | 22.45 | 436.19 | 100 |
| api.clients.list | medium | GET | 109.4 | 95.5 | 496.61 | 100 |
| api.services.list | light | GET | 23.84 | 19.91 | 493.69 | 100 |
| api.services.list | medium | GET | 111.52 | 87.51 | 547.9 | 100 |
| api.dashboard.7d | light | GET | 1820.84 | 633.89 | 14.76 | 50 |
| api.dashboard.7d | medium | GET | 93.75 | 83.73 | 569.43 | 100 |
| api.providers.list | light | GET | 17.95 | 16.62 | 588.75 | 100 |
| api.providers.list | medium | GET | 105.95 | 84.84 | 564.28 | 100 |
| api.resources.list | light | GET | 21.34 | 16.56 | 591.99 | 100 |
| api.resources.list | medium | GET | 80.45 | 74.46 | 643.12 | 100 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 21.27 | 18.28 | 532.87 | 100 |
| api.clients.create | medium | POST | 108.54 | 88.74 | 544.46 | 100 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1388.5 | 1012.44 | 9.48 | 0 |
| ui.dashboard | medium | GET | 6225.25 | 5007.43 | 9.6 | 0 |
| ui.clients | light | GET | 22.51 | 21.31 | 461.8 | 0 |
| ui.clients | medium | GET | 117.82 | 100.24 | 480.9 | 0 |
| ui.calendar | light | GET | 1221.26 | 820.6 | 12.06 | 0 |
| ui.calendar | medium | GET | 6355.59 | 4596.48 | 10.73 | 0 |
| ui.inbox | light | GET | 1016.33 | 734.77 | 12.99 | 0 |
| ui.inbox | medium | GET | 3856.85 | 2982.44 | 16.03 | 0 |
| ui.settings.email | light | GET | 113.42 | 91.21 | 108.81 | 0 |
| ui.settings.email | medium | GET | 679.37 | 385.19 | 124.95 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | no | {"firstInviteStatus":429,"firstInviteMs":13.92,"secondInviteStatus":429,"secondInviteMs":10.5} |
| revoked-invite-rejected | no | {"inviteStatus":429,"inviteMs":14.4,"removeStatus":-1,"acceptStatus":-1,"acceptMs":-1} |
| cross-tenant-nested-denied | no | {"createStatus":429,"ownerBStatus":-1,"clientId":null} |
| staff-forbidden-endpoints | no | {"statuses":[{"name":"edge.staff.forbidden.team","status":429,"durationMs":11.71},{"name":"edge.staff.forbidden.invite","status":429,"durationMs":13.08},{"name":"edge.staff.forbidden.settings","status":429,"durationMs":11.59}]} |

