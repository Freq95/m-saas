# Benchmark Summary

- Run ID: `20260221-105001`
- Timestamp: `2026-02-21T10:50:01.190Z`
- Runtime: `local-prod`
- Target: `http://127.0.0.1:3000`
- Commit: `01f0a70`
- Node: `v18.20.0`

## API Core
No metrics captured.

## API Write
No metrics captured.

## UI Pages
| Endpoint | Tier | Method | p95 (ms) | Avg (ms) | RPS | Error % |
|---|---:|---|---:|---:|---:|---:|
| ui.dashboard | light | GET | 1934.63 | 1304.06 | 7.49 | 0 |
| ui.dashboard | medium | GET | 8085.46 | 5436.84 | 8.93 | 0 |
| ui.clients | light | GET | 61.45 | 32.26 | 303.78 | 0 |
| ui.clients | medium | GET | 142.89 | 131.07 | 354.2 | 0 |
| ui.calendar | light | GET | 1430.81 | 855.45 | 11.29 | 0 |
| ui.calendar | medium | GET | 6943.57 | 4518.57 | 10.8 | 0 |
| ui.inbox | light | GET | 3250.29 | 1561.83 | 6.13 | 0 |
| ui.inbox | medium | GET | 10003.35 | 6669.6 | 7.28 | 6.33 |
| ui.settings.email | light | GET | 144 | 110.16 | 90.16 | 0 |
| ui.settings.email | medium | GET | 623.7 | 420.73 | 111.42 | 0 |

## Edge Checks
No edge checks captured.

