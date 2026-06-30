---
phase: 33-jarvis-ui-cmdK-reliability
plan: 01
subsystem: ui
tags: [jarvis, cmd-k, react, next-app-router, sse, navigation]

requires:
  - phase: 16-jarvis-session-memory-and-crud
    provides: jarvis-voice-transcript event contract, JarvisConsole sessionStorage prefill pattern
  - phase: 6.1-visual-redesign-jarvis-notion
    provides: GlobalJarvisDialog cmd+K dialog, LifeOsQuickSend prefill reference
provides:
  - cmd+K submissions that survive navigation to /today mid-stream
  - GlobalJarvisHandler that no longer aborts in-flight voice turns on route change
affects: [33-02, 33-03, future-jarvis-routing-changes]

tech-stack:
  added: []
  patterns:
    - "Hand off cmd+K text to JarvisConsole via sessionStorage('jarvis-prefill') + router.push('/today') — mirrors LifeOsQuickSend; lets the console own the turn pipeline end-to-end"
    - "Read pathname-derived guards inside event-driven useEffects through a ref so the effect doesn't re-run on every route change and tear down the SSE reader"

key-files:
  created: []
  modified:
    - apps/web/components/jarvis/GlobalJarvisDialog.tsx
    - apps/web/components/jarvis/GlobalJarvisHandler.tsx

key-decisions:
  - "Drop the jarvis-voice-transcript dispatch from cmd+K submissions entirely; reuse the sessionStorage prefill path the lifeOs quick-send already established so there's one canonical handoff to JarvisConsole."
  - "Switch GlobalJarvisHandler's isConsolePage guard to a ref + drop it from the dep array so the effect mounts once and stays mounted; in-flight SSE readers now survive route changes."
  - "Remove abort?.abort() from the cleanup — there's no scenario where unmounting the handler should kill a turn the user just submitted."

patterns-established:
  - "Cross-route JARVIS handoff: stash text in sessionStorage under 'jarvis-prefill', router.push('/today'), let JarvisConsole's mount-effect consume it once."
  - "Long-lived event listeners with route-derived guards: capture the latest pathname state through a ref so the effect itself only re-runs on its true dependencies (userId, queryClient)."

requirements-completed: [JAR-REL-01, JAR-REL-02, JAR-REL-03, JAR-REL-04]

duration: ~5min
completed: 2026-06-29
---

# Phase 33 Plan 01: cmd+K reliability — survive navigation to /today mid-stream

**cmd+K JARVIS submissions now route through JarvisConsole via sessionStorage prefill + router.push, and GlobalJarvisHandler keeps in-flight SSE readers alive across navigation.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-29T18:57:00Z
- **Completed:** 2026-06-29T19:02:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- cmd+K from any non-/today route now hands off via the same sessionStorage prefill path LifeOsQuickSend already uses; JarvisConsole owns the turn pipeline from start to finish.
- GlobalJarvisHandler's useEffect no longer re-runs on pathname change to /today; the SSE reader for the in-flight voice/cmd+K turn survives the navigation.
- abort?.abort() removed from the cleanup so the streaming response continues into JarvisConsole even after the handler component unmounts on the route boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: GlobalJarvisDialog.handleSubmit — route via sessionStorage prefill** — `2aa5f35` (feat)
2. **Task 2: GlobalJarvisHandler — survive navigation via ref + dep-array trim** — `5958d24` (fix)

**Plan metadata:** (this commit) `docs(33-01): write execution summary`

## Files Created/Modified
- `apps/web/components/jarvis/GlobalJarvisDialog.tsx` — `handleSubmit` now stashes the typed text in `sessionStorage('jarvis-prefill')` (try/catch for private browsing) and calls `router.push('/today')`. The `window.dispatchEvent('jarvis-voice-transcript', ...)` call is gone.
- `apps/web/components/jarvis/GlobalJarvisHandler.tsx` — added `isConsolePageRef` mirroring the derived `isConsolePage` boolean; the useEffect reads through the ref so it doesn't re-run on every pathname change. Dep array trimmed to `[queryClient, userId]`. `abort?.abort()` removed from cleanup so in-flight voice turns survive navigation.

## Decisions Made
- **Drop the `jarvis-voice-transcript` dispatch from cmd+K entirely** rather than try to make the cross-component event handoff survive route changes. The sessionStorage path is already battle-tested by LifeOsQuickSend and produces a single canonical entry into JarvisConsole — fewer moving parts, no cleanup races.
- **Use a ref instead of removing the guard outright.** When JarvisConsole is mounted on /today, GlobalJarvisHandler still needs to no-op (otherwise both would process the same `jarvis-voice-transcript` event — exactly the doubling JarvisConsole's `isJarvisConsoleMounted()` check exists to prevent). Reading the guard through a ref lets the effect mount once but still yield to JarvisConsole at runtime.
- **Removing `isConsolePage` from the dep array is the load-bearing change.** Without it, the ref alone wouldn't help — the cleanup would still fire on pathname change. The combination (ref + trimmed deps + no abort-in-cleanup) is what makes navigation survival possible.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Pre-existing typecheck errors in `apps/web/tests/api-jarvis-tts.test.ts` (NextRequest vs Request mismatch on 6 lines) are out of scope for this plan; logged below.

## Deferred Issues (out of scope)

- `apps/web/tests/api-jarvis-tts.test.ts` — pre-existing TS2345 errors on 6 lines where the test constructs a plain `Request` but the route expects `NextRequest`. Not caused by this plan; not in `files_modified`. Should be picked up by a future TTS test refresh.

## Must-Have Verification

- ✅ `sessionStorage.setItem("jarvis-prefill"` present in `GlobalJarvisDialog.tsx` (line 80)
- ✅ `router.push("/today")` in `handleSubmit` (line 84)
- ✅ `jarvis-voice-transcript` dispatchEvent gone from `handleSubmit` (grep returns no match in the file)
- ✅ `isConsolePageRef` present in `GlobalJarvisHandler.tsx` (lines 95, 96, 99)
- ✅ `abort?.abort()` absent from cleanup (only present in an explanatory code comment, not code)
- ✅ Dep array is `[queryClient, userId]` (line 403)
- ✅ `pnpm exec tsc --noEmit` shows zero new errors in the modified files

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- cmd+K routing now matches LifeOsQuickSend's sessionStorage handoff — a single canonical pattern for cross-route JARVIS entry.
- Phase 33 Plan 02 and Plan 03 (bubble UI redesign work) can proceed; this plan was purely behavioral, no visual coupling.
- Issue #172 should close once the next push lands; the PR description should reference `Closes #172`.

## Self-Check: PASSED

- ✅ `apps/web/components/jarvis/GlobalJarvisDialog.tsx` exists and contains the new `handleSubmit`.
- ✅ `apps/web/components/jarvis/GlobalJarvisHandler.tsx` exists and contains `isConsolePageRef` + trimmed dep array + no `abort?.abort()` in cleanup.
- ✅ Commit `2aa5f35` present in `git log` (Task 1).
- ✅ Commit `5958d24` present in `git log` (Task 2).

---
*Phase: 33-jarvis-ui-cmdK-reliability*
*Completed: 2026-06-29*
