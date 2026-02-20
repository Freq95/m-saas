# Benchmark Summary

- Run ID: `20260220-175355`
- Timestamp: `2026-02-20T17:53:55.865Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 563.92 | 363.49 | 26.49 | 0 |
| api.appointments.range | medium | GET | 2332.38 | 1532.04 | 30.19 | 0 |
| api.clients.list | light | GET | 708.17 | 200.36 | 48.44 | 0 |
| api.clients.list | medium | GET | 1036.48 | 943.14 | 51.76 | 0 |
| api.services.list | light | GET | 739.84 | 190.84 | 51.07 | 0 |
| api.services.list | medium | GET | 1029.82 | 952.76 | 51.81 | 0 |
| api.dashboard.7d | light | GET | 689.25 | 239.66 | 40.84 | 0 |
| api.dashboard.7d | medium | GET | 1170.32 | 948.7 | 49.81 | 0 |
| api.providers.list | light | GET | 718.38 | 208.43 | 47.17 | 0 |
| api.providers.list | medium | GET | 1025.82 | 948.88 | 51.46 | 0 |
| api.resources.list | light | GET | 780.62 | 198.14 | 49.21 | 0 |
| api.resources.list | medium | GET | 1054.42 | 949.31 | 51.97 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 955.58 | 652.03 | 14.82 | 0 |
| api.clients.create | medium | POST | 3122.16 | 2482.22 | 18.75 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1859.31 | 1255.48 | 7.65 | 0 |
| ui.dashboard | medium | GET | 7749.67 | 5777.62 | 8.05 | 0 |
| ui.clients | light | GET | 111.83 | 54.56 | 181.51 | 0 |
| ui.clients | medium | GET | 834.42 | 330.2 | 148.17 | 0 |
| ui.calendar | light | GET | 2483.62 | 1065.88 | 9.29 | 0 |
| ui.calendar | medium | GET | 6721.09 | 4735.39 | 10.31 | 0 |
| ui.inbox | light | GET | 1472.55 | 922.72 | 9.27 | 0 |
| ui.inbox | medium | GET | 6828.25 | 4333.32 | 10.27 | 0 |
| ui.settings.email | light | GET | 126.02 | 102.83 | 96.75 | 0 |
| ui.settings.email | medium | GET | 651.33 | 406.96 | 120.36 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":991.06,"secondInviteStatus":403,"secondInviteMs":124.22} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":870.37,"removeStatus":200,"acceptStatus":409,"acceptMs":78.74} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":58.56},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":55.05},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":56.87}]} |

