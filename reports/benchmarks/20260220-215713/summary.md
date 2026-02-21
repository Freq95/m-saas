# Benchmark Summary

- Run ID: `20260220-215713`
- Timestamp: `2026-02-20T21:57:13.573Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 869.83 | 422.57 | 23.33 | 100 |
| api.appointments.range | medium | GET | 2034.64 | 1603.46 | 30.16 | 100 |
| api.clients.list | light | GET | 664.78 | 214.08 | 46.31 | 0 |
| api.clients.list | medium | GET | 1066.43 | 949.38 | 51.18 | 0 |
| api.services.list | light | GET | 857.82 | 325.77 | 30.23 | 100 |
| api.services.list | medium | GET | 1992.01 | 1322.38 | 37.23 | 100 |
| api.dashboard.7d | light | GET | 761.19 | 194.79 | 49.75 | 0 |
| api.dashboard.7d | medium | GET | 1034.48 | 942.24 | 52.22 | 0 |
| api.providers.list | light | GET | 809.53 | 313.06 | 31.62 | 100 |
| api.providers.list | medium | GET | 2003.24 | 1384.13 | 33.93 | 100 |
| api.resources.list | light | GET | 813.05 | 289.11 | 33.58 | 100 |
| api.resources.list | medium | GET | 1985.73 | 1275.86 | 38.49 | 100 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 910.48 | 541.58 | 18.29 | 0 |
| api.clients.create | medium | POST | 2958.03 | 2057.58 | 23.33 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 992.88 | 575.08 | 17.24 | 0 |
| ui.dashboard | medium | GET | 3054.33 | 2771.89 | 16.72 | 0 |
| ui.clients | light | GET | 23.72 | 22.07 | 446.03 | 0 |
| ui.clients | medium | GET | 218.84 | 154.19 | 315.94 | 0 |
| ui.calendar | light | GET | 623.03 | 200.73 | 47.43 | 100 |
| ui.calendar | medium | GET | 1100.52 | 920.4 | 52.68 | 100 |
| ui.inbox | light | GET | 189.86 | 128.39 | 77.44 | 100 |
| ui.inbox | medium | GET | 646 | 383.15 | 127.44 | 100 |
| ui.settings.email | light | GET | 122.95 | 92.26 | 102.92 | 0 |
| ui.settings.email | medium | GET | 664.33 | 360.63 | 132.52 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1006.72,"secondInviteStatus":403,"secondInviteMs":123.76} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":893.42,"removeStatus":200,"acceptStatus":409,"acceptMs":86.25} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":56.13},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":57.73},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":56.64}]} |

