# Claude Review Notes - Session Changes (2026-02-28)

## Scope
This document covers only the modifications made in this Codex session.

Repository note: the git worktree already contains many unrelated modified files.  
Session-specific edits were limited to:

1. `components/Toast.tsx`
2. `app/(auth)/login/page.tsx`

## Change 1: Toast visibility when scrolled in appointment modal

### File
`components/Toast.tsx`

### Problem
When creating an appointment and validation fails (for example missing client name), toast feedback existed but could become effectively not visible depending on scroll/container context.

### Implementation
- Updated `ToastContainer` to render with `createPortal(..., document.body)`.
- Added mounted-state guard (`useState` + `useEffect`) to avoid SSR/hydration issues.
- Kept existing toast API/behavior unchanged.

### Why this fixes it
Rendering to `document.body` detaches the toast from modal/local scroll containers and transformed ancestors, so toast positioning remains viewport-relative and visible.

## Change 2: Next.js async `searchParams` fix on login route

### File
`app/(auth)/login/page.tsx`

### Problem
Runtime warning/error on `/login`:
- `searchParams` is now async in this Next.js setup and cannot be accessed synchronously.

### Implementation
- Converted page to `async` component.
- Updated prop typing to:
  - `searchParams?: Promise<{ success?: string }>`
- Resolved params with `await` before reading `success`.

### Why this fixes it
Complies with Next.js dynamic API requirements for async `searchParams`, eliminating the sync access error.

## Validation Run
Executed:

```bash
npm run typecheck
```

Result:
- Passed after both changes.

## Suggested Claude Verification
1. Open calendar -> create appointment -> leave required name empty -> save.
2. Confirm error toast is visible even when modal/page content is scrolled.
3. Open `/login?success=password-set`.
4. Confirm success message renders and no `searchParams` async error appears in logs.
