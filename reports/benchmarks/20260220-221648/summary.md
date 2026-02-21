# Benchmark Summary

- Run ID: `20260220-221648`
- Timestamp: `2026-02-20T22:16:48.912Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 613.62 | 353.94 | 26.96 | 0 |
| api.appointments.range | medium | GET | 2248.54 | 1402.58 | 33.05 | 0 |
| api.clients.list | light | GET | 665.87 | 188.69 | 51.68 | 0 |
| api.clients.list | medium | GET | 1929.04 | 1218.3 | 38.57 | 0 |
| api.services.list | light | GET | 670.05 | 203.41 | 47.76 | 0 |
| api.services.list | medium | GET | 1922.81 | 1144.35 | 38.51 | 0 |
| api.dashboard.7d | light | GET | 415.09 | 221.59 | 39.13 | 0 |
| api.dashboard.7d | medium | GET | 1801.25 | 1053.6 | 42.11 | 0 |
| api.providers.list | light | GET | 757.32 | 193.57 | 50.5 | 0 |
| api.providers.list | medium | GET | 1944.57 | 1060.42 | 44.04 | 0 |
| api.resources.list | light | GET | 773.78 | 196.91 | 44.28 | 0 |
| api.resources.list | medium | GET | 1786.43 | 985.74 | 48.76 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 1013.93 | 643.06 | 14.36 | 0 |
| api.clients.create | medium | POST | 3182.74 | 2518.94 | 18.81 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1455.56 | 1032.88 | 9.51 | 0 |
| ui.dashboard | medium | GET | 5654.66 | 5119.41 | 9.65 | 0 |
| ui.clients | light | GET | 26.86 | 24.45 | 400.98 | 0 |
| ui.clients | medium | GET | 132.95 | 115.36 | 417.06 | 0 |
| ui.calendar | light | GET | 1503.67 | 973.79 | 9.7 | 0 |
| ui.calendar | medium | GET | 7051.21 | 4790.59 | 10.19 | 0 |
| ui.inbox | light | GET | 3401.01 | 1778.44 | 5.5 | 0 |
| ui.inbox | medium | GET | 10000.08 | 6574.35 | 7.17 | 6 |
| ui.settings.email | light | GET | 141.29 | 105.27 | 94.29 | 0 |
| ui.settings.email | medium | GET | 656.87 | 400.17 | 119.93 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":672.62,"secondInviteStatus":403,"secondInviteMs":140.32} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":908.78,"removeStatus":200,"acceptStatus":409,"acceptMs":87.41} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":60.11},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":58.38},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":56.4}]} |

