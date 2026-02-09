# Cleanup Checklist (No Feature/Design Changes)

Purpose: remove redundant/unnecessary code and repository noise without changing platform behavior or UI design.

## Ground Rules
- [x] No functional changes.
  - Acceptance: user-facing behavior and API responses remain equivalent for maintained endpoints.
- [x] No visual redesign.
  - Acceptance: layouts and styling intent remain unchanged; only dead selectors/rules removed.
- [x] Work only in `D:\m-saas`.
  - Acceptance: no edits outside this project.

## Phase 0: Stabilize Current Working Tree
- [ ] Snapshot current state and classify existing local WIP.
  - Acceptance: list all modified/untracked files and mark each as `keep`, `cleanup target`, or `defer`.
- [ ] Resolve calendar WIP status first (`app/calendar/components/*`, `app/calendar/hooks/*`, related API changes).
  - Acceptance: these files are either intentionally included in scope or explicitly excluded from cleanup pass.

## Phase 1: Remove Confirmed Dead CSS
- [x] Remove legacy navbar selectors from `app/page.module.css` if unused.
  - Acceptance: no `.nav`, `.logo`, `.navLinks` selectors remain unless referenced by TSX.
- [x] Remove legacy navbar selectors from `app/inbox/page.module.css` if unused.
  - Acceptance: same as above; no broken class references.
- [x] Run visual smoke checks on `/`, `/inbox`, `/dashboard`, `/clients`, `/calendar`.
  - Acceptance: pages render correctly; global top nav remains visible as expected.

## Phase 2: Prune Unused Shared Exports
- [x] Audit and remove unused constants from `lib/constants.ts`.
  - Acceptance: every exported constant has at least one real consumer.
- [x] Audit and remove unused schemas from `lib/validation.ts`.
  - Acceptance: every exported schema is referenced by runtime code/tests/docs tooling that is kept.
- [x] Re-run TypeScript/build checks after each small batch.
  - Acceptance: `npm run build` succeeds.

## Phase 3: Retire Dead/Legacy Utility Code
- [x] Decide fate of `lib/date-utils.ts` (`delete` or `archive`).
  - Acceptance: no dead utility file remains in active path without documented reason.
- [x] Complete SQL adapter cleanup boundary:
  - Move shared type(s) out of `lib/db/sql-adapter.ts` if still needed.
  - Remove runtime SQL adapter code if no active usage.
  - Remove `lib/db/index.ts` quarantine shim if unused.
  - Acceptance: active DB layer is clearly Mongo-only and no SQL runtime path remains.

## Phase 4: API Surface Rationalization
- [x] Classify each endpoint as `active`, `feature-flagged`, or `remove`:
  - `app/api/providers/route.ts`
  - `app/api/resources/route.ts`
  - `app/api/waitlist/route.ts`
  - `app/api/blocked-times/route.ts`
  - `app/api/appointments/recurring/route.ts`
  - Acceptance: each endpoint has an explicit status and rationale.
- [x] Remove or isolate endpoints with no maintained consumer and no near-term plan.
  - Acceptance: API surface reflects real product usage.

## Phase 5: Script and Documentation Hygiene
- [x] Clean scripts folder:
  - Move legacy/quarantined scripts to `archived/` (or mark clearly as legacy).
  - Keep only supported scripts discoverable via `package.json`.
  - Acceptance: `scripts/` contains only active operational tooling.
- [x] Align API docs (`app/api/docs/route.ts`) with maintained endpoints.
  - Acceptance: docs are either accurate or explicitly labeled as partial/minimal.
- [x] Keep root docs lean (`README.md`, `STATUS.md`, this checklist).
  - Acceptance: no outdated operational instructions for removed code paths.

## Phase 6: Repository Artifact Hygiene
- [x] Stop tracking runtime-generated uploads and keep only required placeholders.
  - Acceptance: tracked binary/runtime files are removed from Git history going forward.
- [x] Ensure ignore rules cover runtime build/artifact directories (`.next`, `.next-build`, uploads strategy).
  - Acceptance: local runtime artifacts do not appear in `git status`.

## Phase 7: Guardrails
- [x] Add CI/local checks to prevent regressions:
  - build/typecheck gate,
  - unused-export scan,
  - optional dead-style review checklist.
  - Acceptance: cleanup debt is harder to reintroduce silently.

## Final Done Criteria
- [x] `npm run build` passes.
- [x] No dead CSS selectors remain for removed navbar patterns.
- [x] No unused shared exports left in `lib/constants.ts` and `lib/validation.ts`.
- [x] Legacy SQL adapter runtime path is removed or fully isolated.
- [x] API and scripts inventory matches actual maintained scope.
- [x] Runtime artifacts are not tracked in Git.
