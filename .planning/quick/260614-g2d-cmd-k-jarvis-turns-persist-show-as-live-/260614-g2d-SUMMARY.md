---
phase: quick-260614-g2d
plan: 01
type: execute
completed: 2026-06-14
tasks_completed: 2
tasks_total: 3
status: auto-tasks-complete-awaiting-human-verify
---

# Quick 260614-g2d: Cmd+K JARVIS Turns Persist + Show as Live Summary

Cmd+K / non-/today voice JARVIS turns now persist to `jarvis_turns` and live-merge into the /today console scrollback (deduped by client UUID), with the existing toast/TTS/FSM/streaming UX byte-for-byte unchanged.

## What Was Built

- **Task 1 — `GlobalJarvisHandler` persistence.** After the existing `source === "desktop"` early-return guard, `handleVoiceTranscript` now generates a user-turn and assistant-turn UUID, persists the user turn immediately at stream start, accumulates `textDelta`/`actions`/`clarification` across the existing stream callbacks (`onText`, `onQueued`, `onAction`, `onClarification`), and persists the assistant turn on `onDone` (`status:"done"`) and `onError` (`status:"error"` + `errorMessage`). A module-level `persistTurn` helper mirrors `JarvisConsole.persistTurn` byte-for-byte. No existing toast/TTS/FSM/dispatch/abort line was modified. Desktop-sourced transcripts still return early and are NOT persisted in the browser.

- **Task 2 — `JarvisConsole` live-merge + `userId` threading.** Added a required `userId` prop (threaded from `today/page.tsx` and from `JarvisSidePanel` via `loadJarvisInit`). Extracted a module-level `mapTurnRow(row): ScrollbackTurn` helper (single source of truth) and refactored `onLoadOlder` to use it. Added one `useEffect` keyed on `[userId]` that sets realtime auth (`supabase.realtime.setAuth(session.access_token)`), opens a `jarvis_turns` `postgres_changes` channel filtered to `user_id=eq.${userId}`, and on each echo calls `loadJarvisHistoryPage({ limit: 20 })` → `mapTurnRow` → `mergeById`. `mergeById` appends absent ids, updates present ids in place, **skips** any locally-streaming assistant turn (`existing.kind === "assistant" && existing.status === "streaming"`) so the console's own in-flight turn is never clobbered, then re-sorts chronologically. Channel removed on unmount. No `handleSubmit`/streaming/`onDone`/`onError`/persist/undo/clarification logic was modified — the streaming guard is purely status-based, so no `handleSubmit` edit was needed.

## Tasks & Commits

| Task | Description | Commit | Typecheck |
| ---- | ----------- | ------ | --------- |
| 1 | Persist GlobalJarvisHandler turns to jarvis_turns | `ea48a9b` | PASS (only 6 pre-existing tts-test errors) |
| 2 | JarvisConsole live-merge + thread userId | `6415998` | PASS (only 6 pre-existing tts-test errors) |
| 3 | Human-verify checkpoint | — | n/a (manual, see below) |

## Files Modified

- `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — imports + module-level `persistTurn` + turn accumulation across stream callbacks.
- `apps/web/components/jarvis/JarvisConsole.tsx` — `userId` prop, `mapTurnRow` helper, `onLoadOlder` refactor, realtime fetch-and-merge effect.
- `apps/web/app/(app)/today/page.tsx` — pass `userId={user.id}`.
- `apps/web/app/actions/jarvis-init.ts` — add `userId` to `JarvisInitPayload` and return `user.id`.
- `apps/web/components/shell/JarvisSidePanel.tsx` — pass `userId={payload.userId}` to the embedded console.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Thread `userId` through the split-screen side panel**
- **Found during:** Task 2 typecheck.
- **Issue:** Making `userId` a required prop on `JarvisConsole` broke a second call site — `components/shell/JarvisSidePanel.tsx` renders `<JarvisConsole {...payload} />` from `loadJarvisInit`, which did not provide `userId`. New TS2741 error.
- **Fix:** Added `userId: string` to `JarvisInitPayload`, returned `user.id` from `loadJarvisInit` (which already resolves the authed user via `requireOnboarded()`), and passed `userId={payload.userId}` in `JarvisSidePanel`. The embedded console now gets the same live-merge behavior on the split-screen surface.
- **Files modified:** `apps/web/app/actions/jarvis-init.ts`, `apps/web/components/shell/JarvisSidePanel.tsx`.
- **Commit:** `6415998` (bundled with Task 2 — same logical change).

The plan named `today/page.tsx` as the only `userId` consumer; the side panel was an undiscovered second consumer. Threading it was mandatory to keep the build green and is consistent with the plan's intent (the panel's own comment states "Realtime + streaming flows inside JarvisConsole work the same as on /today").

## Typecheck Note

`pnpm --filter web typecheck` reports exactly 6 errors, all in `tests/api-jarvis-tts.test.ts` (`Request` vs `NextRequest`). These are PRE-EXISTING and unrelated to this work — confirmed present before any edits. No new TS errors were introduced by either task.

## Task 3 — Human Verification (in-browser, NOT done programmatically)

The realtime + streaming behavior cannot be verified headlessly. Please verify manually:

1. Run the app locally — `node tools/hyperpolymath/hyperpolymath.mjs` (orchestrator) or the web dev server directly.
2. Open `/today` in **Tab A**. Open any other `(app)` route (e.g. `/calendar`) in **Tab B** (same browser, same session).
3. In **Tab B**, press **Cmd+K** and submit a JARVIS command (e.g. `add task buy milk p1`). Confirm the toast/TTS receipt fires as before (UX unchanged).
4. Switch to **Tab A** (`/today`) **without reloading**: confirm the user turn AND the assistant receipt appear **live** in the scrollback, and are **not duplicated**.
5. **Reload Tab A**: confirm the same turns are still present (SSR hydration from `jarvis_turns`).
6. In **Tab A's own console**, type a normal command and submit: confirm it streams normally, the receipt renders once, and the realtime echo does **not** create a duplicate of it.
7. (If a desktop voice path is available) fire a desktop-sourced turn and confirm it is **not** double-persisted by the browser.

Resume signal: reply "approved" if all checks pass, or describe what misbehaved (duplicates, missing live receipt, broken streaming, changed toast/TTS).

## Self-Check: PASSED

- Files modified verified present (5 files, all edited this session).
- Commits verified: `ea48a9b` (Task 1), `6415998` (Task 2) present in `git log`.
- No new TS errors (6 pre-existing tts-test errors only).
