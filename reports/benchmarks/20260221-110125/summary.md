# Benchmark Summary

- Run ID: `20260221-110125`
- Timestamp: `2026-02-21T11:01:25.090Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.appointments.range | light | GET | 618.87 | 378.76 | 25.1 | 0 |
| api.appointments.range | medium | GET | 2899.98 | 1695.37 | 27.9 | 0 |
| api.clients.list | light | GET | 587.83 | 212.57 | 46.38 | 0 |
| api.clients.list | medium | GET | 1915.56 | 1188.02 | 39.45 | 0 |
| api.services.list | light | GET | 727.6 | 206.87 | 47.26 | 0 |
| api.services.list | medium | GET | 2019.62 | 1196.43 | 37.01 | 0 |
| api.dashboard.7d | light | GET | 514.25 | 195.96 | 49.58 | 0 |
| api.dashboard.7d | medium | GET | 1875.29 | 1104.28 | 43.21 | 0 |
| api.providers.list | light | GET | 792.8 | 226.51 | 43.79 | 0 |
| api.providers.list | medium | GET | 1847.62 | 1063.54 | 41.6 | 0 |
| api.resources.list | light | GET | 814.1 | 226.46 | 43.66 | 0 |
| api.resources.list | medium | GET | 1925.53 | 1048.15 | 43.53 | 0 |

## API Write
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| api.clients.create | light | POST | 1050.77 | 662.64 | 14.16 | 0 |
| api.clients.create | medium | POST | 3118.59 | 2532.1 | 18.64 | 0 |

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1815.34 | 1063.8 | 8.82 | 0 |
| ui.dashboard | medium | GET | 5484.69 | 4960.59 | 9.92 | 0 |
| ui.clients | light | GET | 31.08 | 27.35 | 354.65 | 0 |
| ui.clients | medium | GET | 190.33 | 134.87 | 359.01 | 0 |
| ui.calendar | light | GET | 1360.88 | 890.92 | 11.06 | 0 |
| ui.calendar | medium | GET | 7321.43 | 4809.05 | 10.28 | 0 |
| ui.inbox | light | GET | 1748.77 | 1118.55 | 8.43 | 0 |
| ui.inbox | medium | GET | 6026.36 | 3909.02 | 12.11 | 0 |
| ui.settings.email | light | GET | 119.18 | 98.44 | 100.83 | 0 |
| ui.settings.email | medium | GET | 661.7 | 359.51 | 132.8 | 0 |

## Edge Checks
| Check | Passed | Details |
|---|---|---|
| seat-limit-pending-members | yes | {"firstInviteStatus":201,"firstInviteMs":1043.1,"secondInviteStatus":403,"secondInviteMs":81.95} |
| revoked-invite-rejected | yes | {"inviteStatus":201,"inviteMs":782.2,"removeStatus":200,"acceptStatus":409,"acceptMs":56.49} |
| cross-tenant-nested-denied | yes | {"createStatus":201,"ownerBStatus":404,"clientId":567} |
| staff-forbidden-endpoints | yes | {"statuses":[{"name":"edge.staff.forbidden.team","status":403,"durationMs":37.59},{"name":"edge.staff.forbidden.invite","status":403,"durationMs":39.22},{"name":"edge.staff.forbidden.settings","status":403,"durationMs":38.2}]} |

