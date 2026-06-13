---
phase: 19-tasks-redesign-inbox-universal-day-view-glass-cards
plan: 05
subsystem: jarvis
tags: [jarvis, tasks, inbox, create-task, default-due, receipt]
requires:
  - tasks.dueDate (nullable DATE column — already exists)
  - JarvisReceipt create_task render branch
provides:
  - "No-date → Inbox (NULL) routing in JARVIS create_task pipeline (D-02 / TASK-JARVIS-01)"
  - "Inbox-aware create_task receipt copy 'Added to your Inbox.' (I-7 / TASK-JARVIS-02)"
  - "Explicit undated instruction in the create_task tool description"
affects:
  - apps/web/lib/jarvis/executor.ts
  - apps/web/components/jarvis/JarvisReceipt.tsx
  - packages/jarvis-core/src/tools/index.ts
  - packages/jarvis-core/src/tools/create-task.ts
tech-stack:
  added: []
  patterns:
    - "executor sets server-derived receipt flag (inbox: !input.due) for formatter branching"
key-files:
  created: []
  modified:
    - apps/web/lib/jarvis/executor.ts
    - apps/web/components/jarvis/JarvisReceipt.tsx
    - packages/jarvis-core/src/tools/index.ts
    - packages/jarvis-core/src/tools/create-task.ts
    - apps/web/tests/jarvis-executor.test.ts
decisions:
  - "create_task tool DESCRIPTION lives in packages/jarvis-core/src/tools/index.ts (not create-task.ts) — instruction added there per plan's contingency"
  - "Receipt user-facing 'Added to your Inbox.' copy is rendered in JarvisReceipt.tsx, branching on the server-set receipt.inbox flag (not model-trusted)"
metrics:
  duration: ~12m
  completed: 2026-06-13
---

# Phase 19 Plan 05: JARVIS No-Date → Inbox Routing Summary

Flipped the JARVIS `create_task` default-due policy so an undated task lands in the Inbox (`dueDate = NULL`) instead of being silently dated to today, and made the receipt say "Added to your Inbox." — the load-bearing D-02 behavior.

## What Was Built

### Task 1 — Flip executor default-due policy to NULL + inbox receipt (commit a4bc203)
- `apps/web/lib/jarvis/executor.ts`:
  - The `tasks` insert now uses `dueDate: input.due ? dateInUserTz(input.due, ctx.userTimezone) : null` (was `: todayInTz`).
  - Removed the `todayInTz` computation and its comment block; replaced with a "No-date → Inbox (D-02)" policy comment.
  - Removed the now-unused `import { TZDate } from "@date-fns/tz"`.
  - Receipt block: `due` is now `dateInUserTz(...)` only when a real due exists, else `undefined` (no synthesized today timestamp). Dropped the `allDay` today-synthesis. Added `inbox: !input.due` so the formatter can branch.
- `apps/web/components/jarvis/JarvisReceipt.tsx`:
  - The `create_task` receipt body renders `" · Added to your Inbox."` when `!receipt.due && receipt.inbox` (I-7), preserving the existing `" · due {date}"` copy for dated tasks.

### Task 2 — Explicit undated path in the create_task tool (commit d15bc7c)
- `packages/jarvis-core/src/tools/index.ts`: the `create_task` tool **description** now appends: "DATE: If the user does not specify a date or says 'no date', omit the `due` field entirely. Omitting `due` files the task in the user's Inbox (undated). Do NOT default to today when no date is mentioned — silence means Inbox." The Zod schema (`due` optional) is unchanged.
- `packages/jarvis-core/src/tools/create-task.ts`: added a doc comment on the `due` field explaining it is optional-by-design (D-02), that omission routes to the Inbox, that the model-facing instruction lives in `index.ts`, and that no today/now default exists in this path. **Schema shape unchanged.**
- `apps/web/tests/jarvis-executor.test.ts`: added two D-02 tests — undated input → inserted `dueDate` is null and `receipt.inbox === true` with `receipt.due === undefined`; dated input → `dueDate` is the user-tz date (`2026-05-14`) and `receipt.inbox === false`.

## Plan Note: Description Location
The plan flagged that the `create_task` tool description might live outside `create-task.ts`. It does — the description string is registered in `packages/jarvis-core/src/tools/index.ts` (lines ~100-105). The instruction was added there, and `index.ts` was added to the modified-files set (it was not in the plan's `files_modified` frontmatter). The Zod schema in `create-task.ts` was confirmed correct and left structurally unchanged (only a doc comment added).

## Verification

- `apps/web` tsc: no errors in `executor.ts` or `JarvisReceipt.tsx`.
- `packages/jarvis-core` tsc: exit 0 (clean).
- `apps/web` Vitest `tests/jarvis-executor.test.ts`: 22/22 pass (including 2 new D-02 tests).
- `packages/jarvis-core` Vitest `tests/tools.test.ts`: 22/22 pass (tool description change does not break tool registration).
- grep confirms: `dueDate: ... : null` present, `todayInTz` fully removed, `TZDate` import removed, inbox instruction present in the tool description.

## Deviations from Plan

**1. [Rule 2 — Missing critical functionality] Receipt copy rendered in JarvisReceipt.tsx**
- **Found during:** Task 1.
- **Issue:** The executor receipt is `Record<string, unknown>`; the user-facing "Added to your Inbox." copy (I-7 / TASK-JARVIS-02) is produced by the receipt renderer, not the executor. Setting `inbox` on the receipt alone would not surface the copy.
- **Fix:** Added an `inbox` branch to the `create_task` receipt body in `apps/web/components/jarvis/JarvisReceipt.tsx` so the flag actually renders "Added to your Inbox." This file was not in the plan's `files_modified` but is required to satisfy the I-7 success criterion.
- **Files modified:** apps/web/components/jarvis/JarvisReceipt.tsx
- **Commit:** a4bc203

**2. [Scope addition] Tool description in tools/index.ts**
- **Found during:** Task 2 (anticipated by the plan).
- **Issue:** The create_task description lives in `tools/index.ts`, not `create-task.ts`.
- **Fix:** Instruction added in `index.ts`; doc comment added in `create-task.ts`. Both recorded above.
- **Commit:** d15bc7c

**3. [Test coverage] Added executor D-02 tests**
- The plan's verification suggested running Vitest on the create-task path "if it covers" it. No existing test asserted the old today default (so nothing broke), but to lock the load-bearing D-02 behavior, two explicit tests were added.
- **Commit:** d15bc7c

## Known Stubs
None.

## Threat Flags
None. No new network endpoints, auth paths, file access, or schema changes were introduced. The `inbox` flag is derived server-side from `!input.due` (not model-trusted); `userId` continues to come from `ctx.userId` (`getClaims()`). Consistent with the plan's threat register (T-19-10/11/12, all accept).

## Self-Check: PASSED
- Files: executor.ts, JarvisReceipt.tsx, tools/index.ts, create-task.ts, jarvis-executor.test.ts — all FOUND.
- Commits: a4bc203, d15bc7c — both FOUND.
