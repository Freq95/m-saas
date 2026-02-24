# UI Consistency Review and Standardization Plan (D:\m-saas)

## Summary
Perform a full end-user surface audit (core app + auth + admin), produce a severity-ranked UX/UI consistency report, and deliver an implementation-ready phased remediation roadmap that standardizes theme, components, page skeletons, and interaction patterns across the product.

## Locked Decisions
- Scope: all user-facing surfaces (core + auth + admin).
- Deliverable: audit + fix roadmap.
- Rollout: phased refactor.
- Language standard: Romanian-first for end-user copy and formatting.

## Surfaces in Scope
- Core routes: `/dashboard`, `/inbox`, `/calendar`, `/clients`, `/clients/[id]`, `/settings/email`, home.
- Auth routes: `/login`, `/invite/[token]`.
- Admin routes: `/admin`, `/admin/tenants`, `/admin/users`, `/admin/audit`, `/admin/docs`, related detail/new pages.
- Shared shell/styles/components:
[app/layout.tsx](D:\m-saas\app\layout.tsx), [app/globals.css](D:\m-saas\app\globals.css), [styles/theme.css](D:\m-saas\styles\theme.css), [components/AppChrome.tsx](D:\m-saas\components\AppChrome.tsx), [components/AppTopNav.tsx](D:\m-saas\components\AppTopNav.tsx).

## Current-State Baseline (from repo inspection)
- 19 page routes under `app/**/page.tsx`.
- 13 CSS files for app/components styles.
- 44 direct hex color usages in CSS (outside tokenized usage patterns).
- 116 inline `style={{...}}` usages across app/components, concentrated in auth/admin and some page states.
- Mixed styling paradigms: tokenized CSS modules, hardcoded colors, and inline style-heavy screens.

## Deliverables
1. `D:\m-saas\reports\ui-consistency\01-audit-report.md`  
Includes findings by severity (`Critical`, `High`, `Medium`, `Low`), route/component references, screenshots checklist placeholders, and business impact.
2. `D:\m-saas\reports\ui-consistency\02-design-system-target.md`  
Defines canonical theme, typography, spacing scale, elevation, state colors, motion, and Romanian copy/formatting standards.
3. `D:\m-saas\reports\ui-consistency\03-component-and-skeleton-spec.md`  
Defines target page skeletons and reusable UI primitives with usage rules.
4. `D:\m-saas\reports\ui-consistency\04-phased-roadmap.md`  
Implementation sequence, effort/risk estimates, dependencies, and acceptance gates per phase.
5. `D:\m-saas\reports\ui-consistency\05-checklists.md`  
PR checklist + manual QA checklist for consistency regression control.

## Audit Rubric (decision-complete)
Each route/component gets scored 0-3 on:
- Theme token compliance (no hardcoded visual values except approved exceptions).
- Layout consistency (container width, spacing rhythm, card/panel structure).
- Navigation/chrome coherence (header behavior, active states, spacing offsets).
- Component consistency (buttons/inputs/tables/badges/modals/toasts).
- State design consistency (loading/skeleton, empty, error, success, disabled).
- Typography and copy consistency (Romanian-first labels/messages, hierarchy).
- Accessibility baseline (focus visible, contrast, keyboard reachability).
- Motion and feedback consistency (transition timing, hover/press semantics).

Severity rules:
- `Critical`: breaks navigation, readability, or task completion.
- `High`: clearly inconsistent core patterns across key flows.
- `Medium`: visible drift without major task failure.
- `Low`: polish-level differences.

## Proposed Public Interfaces / Types / Contracts
No backend API changes required.

Front-end contracts to introduce during remediation:
1. Theme token contract extension in [styles/theme.css](D:\m-saas\styles\theme.css): semantic tokens for states (`--color-info`, `--color-warning`, status surfaces, overlay/backdrop, toast variants).
2. Shared UI primitives in `components/ui/*`:
- `Button` variant contract (`primary`, `secondary`, `ghost`, `danger`, `success`).
- `Input`, `Select`, `Badge`, `Card`, `Modal`, `Toast` contracts.
3. Page skeleton/layout contracts in `components/layout/*`:
- `PageShell` (`title`, `subtitle`, `actions`, `maxWidth`).
- `PageSection` and `EmptyState` standardized structure.
4. Optional type-level consistency map in `types/ui.ts`:
- `ButtonVariant`, `StatusTone`, `PageDensity`, `SurfaceLevel`.

## Phased Implementation Plan
1. Phase 0: Inventory and scoring
- Build route-by-route findings table from current code and UI behaviors.
- Tag every finding with severity and impacted file references.
2. Phase 1: System definition
- Finalize canonical tokens and component behavior matrix.
- Define “do/don’t” rules for hardcoded colors, spacing, and inline styles.
3. Phase 2: Foundation refactor
- Normalize global shell/layout behaviors and shared primitives.
- Replace drift-heavy primitives first: toasts, form controls, modal actions, badges.
4. Phase 3: Core app migration
- Migrate dashboard, inbox, calendar, clients, settings to new contracts.
- Standardize loading/empty/error skeleton patterns.
5. Phase 4: Auth and admin alignment
- Remove inline-style-heavy auth/admin divergence.
- Bring auth/admin into the same theme and interaction language.
6. Phase 5: Hardening and governance
- Add consistency checklist to PR process.
- Add lightweight style-lint/grep gates for token violations and new inline style drift.

## Test Cases and Scenarios
1. Route shell consistency
- Every route aligns with approved container widths, top offsets, and section rhythm.
2. Component parity
- Same variant renders consistently in core/auth/admin for button/input/modal/toast/badge.
3. State parity
- Loading, empty, error, success, disabled states match canonical patterns across major pages.
4. Language consistency
- Romanian-first labels/messages and date/number formatting are consistent in user-facing flows.
5. Accessibility smoke
- Keyboard navigation, visible focus, and contrast pass baseline checks on key workflows.
6. Responsive consistency
- Mobile/tablet/desktop checks for nav, tables, panels, and modal behavior.
7. Regression control
- No new hardcoded colors/inline visual styles outside approved exceptions.

## Acceptance Criteria
- All audit findings documented with file-level references and severity.
- Design system target and skeleton spec are sufficient for implementation without new decisions.
- Phased roadmap includes order, scope, risk, and validation gates.
- Clear measurable targets defined: reduced hardcoded colors, reduced inline styles, increased tokenized usage.

## Assumptions and Defaults
- Product visual direction remains dark, glass-like theme already present in core pages.
- Romanian is the default end-user language standard; English-only admin copy will be flagged for normalization.
- No functional behavior changes are in scope unless required to support visual/system consistency.
- Existing route structure and backend APIs stay unchanged during consistency remediation.
