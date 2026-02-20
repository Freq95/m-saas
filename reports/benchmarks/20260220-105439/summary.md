# Benchmark Summary

- Run ID: `20260220-105439`
- Timestamp: `2026-02-20T10:54:39.521Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 1016.5 | 547.38 | 17.96 | 0 |
| api.appointments.range | medium | GET | 3299.64 | 2594.49 | 18.6 | 0 |
| api.clients.list | light | GET | 909.29 | 422.86 | 23.45 | 0 |
| api.clients.list | medium | GET | 2024.84 | 1975 | 25.2 | 0 |
| api.services.list | light | GET | 885.77 | 281.03 | 30.76 | 0 |
| api.services.list | medium | GET | 2007.65 | 1375.59 | 32.92 | 0 |
| api.dashboard.7d | light | GET | 1880.33 | 1249.26 | 7.76 | 0 |
| api.dashboard.7d | medium | GET | 7162.39 | 5203.36 | 9.17 | 0 |
| api.providers.list | light | GET | 881.34 | 292.14 | 33.72 | 0 |
| api.providers.list | medium | GET | 2006.75 | 1428.83 | 33.7 | 0 |
| api.resources.list | light | GET | 894.87 | 317.34 | 31.06 | 0 |
| api.resources.list | medium | GET | 2001.23 | 1321.13 | 37.42 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 943.82 | 640.43 | 14.84 | 0 |
| api.clients.create | medium | POST | 3041.74 | 2397.41 | 20.07 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1447.3 | 1071.31 | 8.79 | 0 |
| ui.dashboard | medium | GET | 6959.74 | 4952.7 | 9.64 | 0 |
| ui.clients | light | GET | 26.16 | 23.49 | 414.53 | 0 |
| ui.clients | medium | GET | 137.71 | 114.5 | 419.11 | 0 |
| ui.calendar | light | GET | 1330.69 | 829.87 | 11.95 | 0 |
| ui.calendar | medium | GET | 6839.45 | 4593.48 | 10.65 | 0 |
| ui.inbox | light | GET | 1003.16 | 713.24 | 13.74 | 0 |
| ui.inbox | medium | GET | 4021.76 | 3001.48 | 15.99 | 0 |
| ui.settings.email | light | GET | 136.39 | 100.63 | 98.7 | 0 |
| ui.settings.email | medium | GET | 717.65 | 396.39 | 120.93 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1129.52,"secondInviteStatus":403,"secondInviteMs":116.09} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":883.17,"removeStatus":200,"acceptStatus":409,"acceptMs":79.13} |
| cross-tenant-nested-denied | yes | {"createStatus":200,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":53.83},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":54.29},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":52.22}]} |

