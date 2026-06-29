---
phase: 33-jarvis-ui-cmdK-reliability
plan: 02
subsystem: ui
tags: [jarvis, ui, motion, tailwind, glass, react-19]

# Dependency graph
requires:
  - phase: 06.1-visual-redesign-jarvis-notion
    provides: glass-tile / glass-button surface system, --hud-cyan / --hud-cyan-glow-soft tokens, hud-focus-breathe keyframe
  - phase: 33-jarvis-ui-cmdK-reliability/01
    provides: phase entry + dependency map for the UI rework
provides:
  - iMessage-style bubble layout for the JARVIS scrollback (right-aligned user, left-aligned cyan-haloed JARVIS)
  - retry affordance on errored assistant turns
  - glass composer strip matching the bubble register
  - wired hud-focus-breathe ring on focused-idle input state
affects: [jarvis-console, daily-page, lifeos-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "iMessage bubble pattern: max-width 72-82%, motion enter (opacity + y:6→0, 220ms ease-out-back), per-bubble glass token application"
    - "Per-error retry via onRetry callback resolved against the preceding user turn in turnsRef"
    - "Composer surface upgraded from bg-card to var(--glass-bg) + backdrop-blur(12px) to live inside the glass register"

key-files:
  created: []
  modified:
    - apps/web/components/jarvis/JarvisScrollback.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/components/jarvis/JarvisInput.tsx

key-decisions:
  - "User bubbles use neutral var(--glass-bg) + soft --edge border (no cyan glow); JARVIS bubbles add 20px --hud-cyan-glow-soft halo so the agent voice is visually distinct"
  - "TurnTimestamp moved from absolute corner to below each bubble (left/right-aligned to match its speaker) so it no longer collides with bubble content"
  - "Retry calls handleSubmit with the original user text rather than reusing the turn ID, so the SSE stream produces a fresh assistantId and the failed turn stays as a historical record"

patterns-established:
  - "Glass-tile bubble pattern: glass-tile class + boxShadow that combines glass-raise/drop + inset highlights + cyan-glow-soft halo for the JARVIS register"
  - "iMessage layout: outer flex justify-{start|end}, inner max-w-[72-82%] column, label-above-bubble for assistant"

requirements-completed: [JAR-UI-01, JAR-UI-02, JAR-UI-03]

# Metrics
duration: ~10min
completed: 2026-06-29
---

# Phase 33 Plan 02: JARVIS bubble layout + glass composer + focus-ring fix

**iMessage-style bubble scrollback with right-aligned user glass bubbles, left-aligned cyan-haloed JARVIS bubbles, glass composer strip, and the hud-focus-breathe ring finally wired to the focused-idle input state.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-29T15:05Z
- **Completed:** 2026-06-29T15:15Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Replaced the flat terminal scrollback with an iMessage-style bubble layout; user turns sit on the right as neutral glass bubbles and JARVIS turns on the left as cyan-haloed glass bubbles with a "JARVIS" label above.
- Added a `↺ Retry` button on errored assistant turns; clicking it resubmits the preceding user turn through `handleSubmit`.
- Upgraded the composer strip from `bg-card` to `var(--glass-bg)` with a 12px backdrop blur and a softened `--edge-hud` border so it matches the bubble register.
- Wired the `.hud-focus-breathe` keyframe that had been declared in `globals.css` but never applied; the input ring now actually breathes in State 2 (focused-idle).

## Task Commits

1. **Task 1: Rearchitect JarvisScrollback** — `8081158` (feat)
2. **Task 2: Glass composer + onRetry** — `3d6c6eb` (fix)
3. **Task 3: hud-focus-breathe wired** — `8195dcf` (fix)

## Files Created/Modified
- `apps/web/components/jarvis/JarvisScrollback.tsx` — Bubble layout, `onRetry` prop, `motion` import, dropped outer `font-mono`, moved TurnTimestamp under bubbles.
- `apps/web/components/jarvis/JarvisConsole.tsx` — Glass composer container, wired `onRetry` callback to resolve the preceding user turn via `turnsRef.current` and resubmit it.
- `apps/web/components/jarvis/JarvisInput.tsx` — Added `hud-focus-breathe` class to the wrapper className array (gated on `focusedIdle && !shouldReduce`).

## Decisions Made
- Bubble enter motion: `opacity 0 → 1` + `y 6 → 0` over 220ms with the Stark-friendly `[0.25, 1, 0.5, 1]` ease. Skipped under `useReducedMotion`.
- The JARVIS bubble keeps its existing `.hud-error-glitch` jitter and `borderLeft: 3px solid var(--ink-coral)` error treatment, layered onto the new glass surface — preserves the Phase 6.1 error register without re-painting it.
- The Daily Page badge still renders inside the user bubble, but with a softer "Processed this page" caption (Phase 6.1's caption stays).

## Deviations from Plan

None — plan executed as written. Two minor additions inside Rule 2 / Rule 3 territory:

- Added `WebkitBackdropFilter` alongside `backdropFilter` on the user bubble and composer strip so Safari renders the blur. Without it the glass surface degrades to a flat colour fill on WebKit. (Rule 2 — missing critical for cross-browser visual parity.)
- Wrapped `actions` and `clarification` blocks in conditional `mt-2` containers inside the JARVIS bubble so they don't collide with prose when prose is also present. (Rule 1 — visual bug from the old `ml-3` outer container being removed.)

Both changes are inside the same Task 1 commit (`8081158`) and don't add deps or new APIs.

## Issues Encountered
- `pnpm exec tsc --noEmit` at the repo root errored because there's no root `tsconfig.json`. Ran the typecheck from `apps/web/` instead. Only pre-existing errors in `tests/api-jarvis-tts.test.ts` (NextRequest typing) surfaced; zero errors in the three modified files.

## Must-have verification

All four greps return results:

```
$ grep -n "justify-end" apps/web/components/jarvis/JarvisScrollback.tsx
356:                <div className="flex justify-end mb-3">

$ grep -n "hud-cyan-glow-soft" apps/web/components/jarvis/JarvisScrollback.tsx
28: *     --hud-cyan-glow-soft light-trail follows behind the caret as an
421:  ...inset 0 -1px 0 var(--glass-lo), 0 0 20px var(--hud-cyan-glow-soft)...
460:  ...linear-gradient(90deg, transparent 0%, var(--hud-cyan-glow-soft) 50%, transparent 100%)...

$ grep -n "glass-bg" apps/web/components/jarvis/JarvisConsole.tsx
1250:          backgroundColor: "var(--glass-bg)",

$ grep -n "hud-focus-breathe" apps/web/components/jarvis/JarvisInput.tsx
419:  // State 2 (focused-idle): focused, no content → 2px --hud-cyan + .hud-focus-breathe ring
430:        // - .hud-focus-breathe class (Plan 01 keyframe): only when focused-idle,
442:          focusedIdle && !shouldReduce ? "hud-focus-breathe" : "",
```

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Visual rework lands cleanly; the orchestrator can run the human-verify checkpoint (autonomous: false on this plan) by loading `/today`, focusing JARVIS, sending a message, and visually confirming bubble alignment + glow + focus breathe.
- Note: `autonomous: false` — orchestrator will run the checkpoint separately.

## Self-Check: PASSED

- `apps/web/components/jarvis/JarvisScrollback.tsx` exists.
- `apps/web/components/jarvis/JarvisConsole.tsx` exists.
- `apps/web/components/jarvis/JarvisInput.tsx` exists.
- Commits `8081158`, `3d6c6eb`, `8195dcf` present in `git log`.

---
*Phase: 33-jarvis-ui-cmdK-reliability*
*Completed: 2026-06-29*
