# Benchmark Summary

- Run ID: `20260220-175609`
- Timestamp: `2026-02-20T17:56:09.058Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 2645.86 | 1405.07 | 6.99 | 0 |
| api.appointments.range | medium | GET | 2430.71 | 1714.38 | 27.35 | 0 |
| api.clients.list | light | GET | 636.45 | 212.02 | 45.79 | 0 |
| api.clients.list | medium | GET | 1032.78 | 955.75 | 45.31 | 0 |
| api.services.list | light | GET | 725.18 | 224.25 | 39.88 | 0 |
| api.services.list | medium | GET | 1045.2 | 915.76 | 49.65 | 0 |
| api.dashboard.7d | light | GET | 2636.05 | 673.91 | 14.58 | 0 |
| api.dashboard.7d | medium | GET | 1176.37 | 940.62 | 50.41 | 0 |
| api.providers.list | light | GET | 750.36 | 213.32 | 36.65 | 0 |
| api.providers.list | medium | GET | 1035.11 | 907.44 | 49.86 | 0 |
| api.resources.list | light | GET | 751.09 | 213.7 | 35.97 | 0 |
| api.resources.list | medium | GET | 1037.82 | 906.38 | 49.72 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 2825.88 | 1601.43 | 5.79 | 0 |
| api.clients.create | medium | POST | 5030.14 | 3392.02 | 14.25 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1575.31 | 1200.36 | 8.04 | 0 |
| ui.dashboard | medium | GET | 7183.96 | 5267.04 | 9.09 | 0 |
| ui.clients | light | GET | 22.93 | 20.47 | 479.5 | 0 |
| ui.clients | medium | GET | 115.39 | 100.69 | 476.36 | 0 |
| ui.calendar | light | GET | 1380.03 | 886.66 | 11.11 | 0 |
| ui.calendar | medium | GET | 6970.41 | 4923.47 | 10.03 | 0 |
| ui.inbox | light | GET | 996.84 | 742.91 | 13.13 | 0 |
| ui.inbox | medium | GET | 3672.89 | 2915.34 | 16.4 | 0 |
| ui.settings.email | light | GET | 113.46 | 98.96 | 100.25 | 0 |
| ui.settings.email | medium | GET | 653.78 | 347.21 | 136.69 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":615.25,"secondInviteStatus":403,"secondInviteMs":119.95} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":509.46,"removeStatus":200,"acceptStatus":409,"acceptMs":74.49} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":51.29},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":51.51},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":51.5}]} |

