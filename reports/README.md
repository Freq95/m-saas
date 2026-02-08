# Reports Documentation Standard

This folder is the single source of truth for m-saas progress and planning.

## Canonical Files

1. `reports/PROJECT_STATUS.md`
- Current state by domain (calendar, inbox, integrations, platform).
- High-priority blockers and next actions.

2. `reports/SESSION_LOG.md`
- Chronological session entries (date, scope, completed work, risks, next).

3. Feature deep-dives and plans
- Keep focused docs here (e.g., calendar deep dive, inbox plans, architecture notes).

## Update Rules

1. After each implementation session:
- Add one entry to `reports/SESSION_LOG.md`.
- Update `reports/PROJECT_STATUS.md` if priorities/status changed.

2. Do not use repository root `.md` files for ongoing status updates.
- Root docs are historical unless explicitly promoted here.

3. Keep entries concise and execution-focused.
- Use outcomes, blockers, and next actions only.

