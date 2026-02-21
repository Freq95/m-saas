# Benchmark Summary

- Run ID: `20260221-102643`
- Timestamp: `2026-02-21T10:26:43.238Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 587.27 | 339.63 | 27.96 | 0 |
| api.appointments.range | medium | GET | 2212.42 | 1452.78 | 31.49 | 0 |
| api.clients.list | light | GET | 704.89 | 206.46 | 47.02 | 0 |
| api.clients.list | medium | GET | 1993.94 | 1213.18 | 38.24 | 0 |
| api.services.list | light | GET | 732.57 | 214.11 | 45.35 | 0 |
| api.services.list | medium | GET | 1929.84 | 1159.9 | 38.65 | 0 |
| api.dashboard.7d | light | GET | 627.17 | 190.24 | 51.38 | 0 |
| api.dashboard.7d | medium | GET | 1827.58 | 1131.42 | 38.44 | 0 |
| api.providers.list | light | GET | 756.91 | 193.04 | 50.39 | 0 |
| api.providers.list | medium | GET | 1887.76 | 1083.4 | 42.92 | 0 |
| api.resources.list | light | GET | 754.17 | 190.9 | 51.11 | 0 |
| api.resources.list | medium | GET | 1877.24 | 1050.69 | 43.66 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 989.25 | 670.1 | 14.03 | 0 |
| api.clients.create | medium | POST | 3145.08 | 2491.7 | 18.68 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1774.53 | 1114.91 | 8.84 | 0 |
| ui.dashboard | medium | GET | 5751.18 | 5094.22 | 9.7 | 0 |
| ui.clients | light | GET | 33.63 | 26.05 | 374.84 | 0 |
| ui.clients | medium | GET | 174.58 | 124.33 | 386.9 | 0 |
| ui.calendar | light | GET | 1496.1 | 982.62 | 9.96 | 0 |
| ui.calendar | medium | GET | 7224.82 | 4874.69 | 10.13 | 0 |
| ui.inbox | light | GET | 938.87 | 670.66 | 14.2 | 0 |
| ui.inbox | medium | GET | 4236.54 | 2594.44 | 18.22 | 0 |
| ui.settings.email | light | GET | 107.6 | 93.45 | 106.42 | 0 |
| ui.settings.email | medium | GET | 670.5 | 366.5 | 133.49 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":976.37,"secondInviteStatus":403,"secondInviteMs":84.15} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":788.74,"removeStatus":200,"acceptStatus":409,"acceptMs":71.08} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":72.4},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":74.14},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":72.97}]} |

