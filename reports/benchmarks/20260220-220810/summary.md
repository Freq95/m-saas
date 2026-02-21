# Benchmark Summary

- Run ID: `20260220-220810`
- Timestamp: `2026-02-20T22:08:10.588Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 723.63 | 414.27 | 22.55 | 0 |
| api.appointments.range | medium | GET | 2200.87 | 1497.24 | 31.2 | 0 |
| api.clients.list | light | GET | 688.58 | 307.88 | 31.59 | 0 |
| api.clients.list | medium | GET | 1923.04 | 1251.56 | 37.58 | 0 |
| api.services.list | light | GET | 682.99 | 242.55 | 39.56 | 0 |
| api.services.list | medium | GET | 1930.37 | 1193.9 | 38.15 | 0 |
| api.dashboard.7d | light | GET | 620.89 | 239.14 | 39.18 | 0 |
| api.dashboard.7d | medium | GET | 1866.68 | 1119.35 | 39.71 | 0 |
| api.providers.list | light | GET | 651.37 | 180.98 | 53.94 | 0 |
| api.providers.list | medium | GET | 1965.92 | 1115.38 | 38.67 | 0 |
| api.resources.list | light | GET | 645.18 | 193.92 | 50.14 | 0 |
| api.resources.list | medium | GET | 1958.65 | 1056.66 | 44.41 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 1010.01 | 668.31 | 14.8 | 0 |
| api.clients.create | medium | POST | 3102.16 | 2541.54 | 18.68 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1919.27 | 1317.36 | 7.29 | 0 |
| ui.dashboard | medium | GET | 7542.78 | 6252 | 7.62 | 0 |
| ui.clients | light | GET | 140.37 | 126.68 | 78.3 | 0 |
| ui.clients | medium | GET | 641.11 | 536.7 | 91.18 | 0 |
| ui.calendar | light | GET | 2025.44 | 1552.81 | 6.23 | 0 |
| ui.calendar | medium | GET | 10011.61 | 8274.82 | 5.94 | 14.67 |
| ui.inbox | light | GET | 2660.29 | 1772.24 | 5.4 | 0 |
| ui.inbox | medium | GET | 10008.67 | 7920.86 | 5.99 | 13 |
| ui.settings.email | light | GET | 302.98 | 225.33 | 42.96 | 0 |
| ui.settings.email | medium | GET | 895.26 | 778.14 | 61.4 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":2235.27,"secondInviteStatus":403,"secondInviteMs":120.41} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":830.24,"removeStatus":200,"acceptStatus":409,"acceptMs":1249.21} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":779.88},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":916.19},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":867.96}]} |

