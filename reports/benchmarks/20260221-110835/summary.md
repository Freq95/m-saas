# Benchmark Summary

- Run ID: `20260221-110835`
- Timestamp: `2026-02-21T11:08:35.188Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 1034.9 | 569.85 | 16.19 | 0 |
| api.appointments.range | medium | GET | 3240.68 | 2588.47 | 18.38 | 0 |
| api.clients.list | light | GET | 863.24 | 395.67 | 24.82 | 0 |
| api.clients.list | medium | GET | 2040.28 | 1947.56 | 25.35 | 0 |
| api.services.list | light | GET | 878.95 | 275.43 | 30.73 | 0 |
| api.services.list | medium | GET | 2026.55 | 1456 | 32.85 | 0 |
| api.dashboard.7d | light | GET | 1975.84 | 1432.53 | 6.73 | 0 |
| api.dashboard.7d | medium | GET | 7022.75 | 5616.03 | 8.55 | 0 |
| api.providers.list | light | GET | 826.09 | 264.72 | 37.19 | 0 |
| api.providers.list | medium | GET | 1997.1 | 1367.62 | 34.08 | 0 |
| api.resources.list | light | GET | 867.63 | 309.73 | 28.9 | 0 |
| api.resources.list | medium | GET | 2013.9 | 1304.88 | 37.37 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 973.8 | 680.26 | 14.13 | 0 |
| api.clients.create | medium | POST | 3056.85 | 2424.68 | 19.89 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1152.78 | 928.8 | 10.45 | 0 |
| ui.dashboard | medium | GET | 5711.91 | 4930.95 | 9.83 | 0 |
| ui.clients | light | GET | 25.79 | 23.25 | 422.21 | 0 |
| ui.clients | medium | GET | 117.16 | 106.28 | 453.13 | 0 |
| ui.calendar | light | GET | 1422.51 | 913.47 | 10.72 | 0 |
| ui.calendar | medium | GET | 6645.38 | 4842.73 | 10.19 | 0 |
| ui.inbox | light | GET | 1537.35 | 1004.36 | 9.63 | 0 |
| ui.inbox | medium | GET | 7049.7 | 4401.89 | 10.94 | 0 |
| ui.settings.email | light | GET | 119.17 | 99.36 | 99.95 | 0 |
| ui.settings.email | medium | GET | 668.3 | 407.46 | 114.35 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1144.38,"secondInviteStatus":403,"secondInviteMs":119.02} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":850.37,"removeStatus":200,"acceptStatus":409,"acceptMs":77.84} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":56.79},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":57.71},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":58.62}]} |

