# Benchmark Summary

- Run ID: `20260220-093936`
- Timestamp: `2026-02-20T09:39:36.249Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 834.44 | 289.67 | 31.94 | 100 |
| api.appointments.range | medium | GET | 1930.32 | 1236.77 | 37.74 | 100 |
| api.clients.list | light | GET | 882.81 | 405.84 | 24.4 | 0 |
| api.clients.list | medium | GET | 2930.67 | 2055.27 | 23.22 | 0 |
| api.services.list | light | GET | 881.33 | 318.78 | 30.9 | 0 |
| api.services.list | medium | GET | 2001.08 | 1491.46 | 33.29 | 0 |
| api.dashboard.7d | light | GET | 2021.92 | 1253.55 | 7.67 | 0 |
| api.dashboard.7d | medium | GET | 7392.87 | 5218.06 | 9.07 | 0 |
| api.providers.list | light | GET | 873.8 | 273.49 | 36.01 | 0 |
| api.providers.list | medium | GET | 2004.85 | 1468.38 | 33.72 | 0 |
| api.resources.list | light | GET | 883.76 | 258.06 | 37.86 | 0 |
| api.resources.list | medium | GET | 2003.9 | 1444.2 | 33.66 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 1700.46 | 1004.17 | 9.81 | 100 |
| api.clients.create | medium | POST | 5051.94 | 3642.04 | 13.12 | 100 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1496.88 | 1091.35 | 8.78 | 0 |
| ui.dashboard | medium | GET | 7105.33 | 4846.59 | 9.81 | 0 |
| ui.clients | light | GET | 24.15 | 22.02 | 447.46 | 0 |
| ui.clients | medium | GET | 113.82 | 102.57 | 472.89 | 0 |
| ui.calendar | light | GET | 1306.81 | 823.07 | 11.96 | 0 |
| ui.calendar | medium | GET | 6270.53 | 4371.15 | 11.27 | 0 |
| ui.inbox | light | GET | 1039.26 | 730.23 | 13.08 | 0 |
| ui.inbox | medium | GET | 3991.2 | 2908.5 | 16.33 | 0 |
| ui.settings.email | light | GET | 100.63 | 80.42 | 123.21 | 0 |
| ui.settings.email | medium | GET | 710.51 | 367.16 | 131.76 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1217.03,"secondInviteStatus":403,"secondInviteMs":115.99} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":541.36,"removeStatus":200,"acceptStatus":409,"acceptMs":78.71} |
| cross-tenant-nested-denied | no | {"createStatus":200,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":73.16},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":73.55},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":71.99}]} |

