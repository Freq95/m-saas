# Benchmark Summary

- Run ID: `20260220-205902`
- Timestamp: `2026-02-20T20:59:02.594Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 870.53 | 370.4 | 26.48 | 100 |
| api.appointments.range | medium | GET | 2032.59 | 1613.69 | 30.43 | 100 |
| api.clients.list | light | GET | 769.17 | 230.87 | 42.96 | 0 |
| api.clients.list | medium | GET | 1030.14 | 939.57 | 51.33 | 0 |
| api.services.list | light | GET | 844.02 | 314.5 | 31.54 | 100 |
| api.services.list | medium | GET | 1983.95 | 1313.77 | 34.13 | 100 |
| api.dashboard.7d | light | GET | 749.13 | 177.6 | 54.89 | 0 |
| api.dashboard.7d | medium | GET | 1016.18 | 951.82 | 51.82 | 0 |
| api.providers.list | light | GET | 843.07 | 269.58 | 36.6 | 100 |
| api.providers.list | medium | GET | 1987.19 | 1390.63 | 33.97 | 100 |
| api.resources.list | light | GET | 801.61 | 264.72 | 36.97 | 100 |
| api.resources.list | medium | GET | 1989.14 | 1349.53 | 34.31 | 100 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 918.77 | 536.68 | 17.22 | 0 |
| api.clients.create | medium | POST | 2655.98 | 2048.65 | 23.17 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 987.65 | 572.45 | 17.31 | 0 |
| ui.dashboard | medium | GET | 3039.24 | 2782.81 | 16.69 | 0 |
| ui.clients | light | GET | 23.03 | 20.8 | 470.33 | 0 |
| ui.clients | medium | GET | 113.75 | 98.98 | 487.95 | 0 |
| ui.calendar | light | GET | 683.14 | 200.63 | 49.65 | 100 |
| ui.calendar | medium | GET | 1024.58 | 946.75 | 51.09 | 100 |
| ui.inbox | light | GET | 126.76 | 105.38 | 94.39 | 100 |
| ui.inbox | medium | GET | 661.8 | 406.96 | 117.57 | 100 |
| ui.settings.email | light | GET | 124.81 | 100.09 | 99.41 | 0 |
| ui.settings.email | medium | GET | 697.92 | 396.46 | 121.06 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":939.51,"secondInviteStatus":403,"secondInviteMs":113.23} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":503.79,"removeStatus":200,"acceptStatus":409,"acceptMs":73.38} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":47.84},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":50.67},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":48.32}]} |

