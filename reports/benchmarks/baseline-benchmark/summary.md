# Benchmark Summary

- Run ID: `20260220-110718`
- Timestamp: `2026-02-20T11:07:18.281Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 1009.55 | 575.7 | 16.78 | 0 |
| api.appointments.range | medium | GET | 3252.83 | 2512.41 | 18.66 | 0 |
| api.clients.list | light | GET | 904.31 | 420.35 | 23.44 | 0 |
| api.clients.list | medium | GET | 2045.21 | 1971.07 | 25.13 | 0 |
| api.services.list | light | GET | 849.35 | 259.58 | 37.97 | 0 |
| api.services.list | medium | GET | 2019.8 | 1479.55 | 30.43 | 0 |
| api.dashboard.7d | light | GET | 1792.12 | 1267.55 | 7.62 | 0 |
| api.dashboard.7d | medium | GET | 6891.94 | 5181.16 | 9.22 | 0 |
| api.providers.list | light | GET | 872.05 | 287.7 | 34.4 | 0 |
| api.providers.list | medium | GET | 2014.76 | 1402.75 | 33.84 | 0 |
| api.resources.list | light | GET | 877.99 | 262.37 | 37.47 | 0 |
| api.resources.list | medium | GET | 1977.71 | 1368.92 | 33.98 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 1000.37 | 640.52 | 15.49 | 0 |
| api.clients.create | medium | POST | 3054.28 | 2419.41 | 19.97 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1528.79 | 1073.98 | 8.95 | 0 |
| ui.dashboard | medium | GET | 7084.91 | 5295.33 | 9.05 | 0 |
| ui.clients | light | GET | 24.34 | 21.19 | 464.2 | 0 |
| ui.clients | medium | GET | 110.76 | 99.13 | 487.32 | 0 |
| ui.calendar | light | GET | 1313.33 | 849.52 | 11.63 | 0 |
| ui.calendar | medium | GET | 6390.69 | 4541.54 | 10.81 | 0 |
| ui.inbox | light | GET | 961.87 | 698.37 | 13.95 | 0 |
| ui.inbox | medium | GET | 3719.28 | 2926.3 | 16.33 | 0 |
| ui.settings.email | light | GET | 121.8 | 96.58 | 102.98 | 0 |
| ui.settings.email | medium | GET | 678.45 | 378.32 | 126.43 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1248.26,"secondInviteStatus":403,"secondInviteMs":115.67} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":914.28,"removeStatus":200,"acceptStatus":409,"acceptMs":82.92} |
| cross-tenant-nested-denied | yes | {"createStatus":200,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":53.35},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":53.55},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":53.96}]} |

