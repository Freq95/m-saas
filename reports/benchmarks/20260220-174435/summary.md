# Benchmark Summary

- Run ID: `20260220-174435`
- Timestamp: `2026-02-20T17:44:35.866Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `a1ab4ea`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 699.3 | 395.6 | 24.01 | 0 |
| api.appointments.range | medium | GET | 2201.59 | 1479.2 | 31.75 | 0 |
| api.clients.list | light | GET | 720.91 | 200.01 | 48.43 | 0 |
| api.clients.list | medium | GET | 1918.71 | 1204.49 | 37.85 | 0 |
| api.services.list | light | GET | 738.56 | 225.71 | 40.39 | 0 |
| api.services.list | medium | GET | 1928.01 | 1099.31 | 39.57 | 0 |
| api.dashboard.7d | light | GET | 735.93 | 242.07 | 40.52 | 0 |
| api.dashboard.7d | medium | GET | 1768.81 | 1075.48 | 42.8 | 0 |
| api.providers.list | light | GET | 681.97 | 179.37 | 53.92 | 0 |
| api.providers.list | medium | GET | 1924.19 | 1067.72 | 43.42 | 0 |
| api.resources.list | light | GET | 757.22 | 187.92 | 51.95 | 0 |
| api.resources.list | medium | GET | 1833.44 | 1044.02 | 43.73 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 952.63 | 622.31 | 15 | 0 |
| api.clients.create | medium | POST | 3125.49 | 2531.47 | 18.74 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1489.87 | 1066.1 | 9.07 | 0 |
| ui.dashboard | medium | GET | 7133.76 | 5095 | 9.42 | 0 |
| ui.clients | light | GET | 30.45 | 25.1 | 384.95 | 0 |
| ui.clients | medium | GET | 131.19 | 115.45 | 418.79 | 0 |
| ui.calendar | light | GET | 1373.22 | 855.85 | 11.37 | 0 |
| ui.calendar | medium | GET | 6812.58 | 4715.9 | 10.45 | 0 |
| ui.inbox | light | GET | 1014.9 | 717.68 | 13.44 | 0 |
| ui.inbox | medium | GET | 3859.35 | 2925.77 | 16.48 | 0 |
| ui.settings.email | light | GET | 107.05 | 86.67 | 114.4 | 0 |
| ui.settings.email | medium | GET | 709.18 | 394.75 | 121.64 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1113.6,"secondInviteStatus":403,"secondInviteMs":119.21} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":938.21,"removeStatus":200,"acceptStatus":409,"acceptMs":80.98} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":55.01},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":56.74},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":54.42}]} |

