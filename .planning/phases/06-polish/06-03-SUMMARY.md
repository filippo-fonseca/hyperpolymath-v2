---
phase: 06-polish
plan: 03
subsystem: jarvis-ux
tags: [cmd-k, focus-delegation, motion, page-transitions, jarvis-blue, holographic, reduced-motion, react-19, ref-as-prop]

# Dependency graph
requires:
  - phase: 06-polish
    provides: JARVIS-blue accent token (--color-accent-jarvis), neumorphic shadow scale, universal cursor:pointer (06-01-SUMMARY.md)
provides:
  - Module-level singleton (lib/jarvis/focus.ts) for cross-tree JARVIS focus dispatch — registerJarvisFocus(fn) + focusJarvis()
  - GlobalHotkeys client component (components/shell/GlobalHotkeys.tsx) mounting Cmd+K window listener at (app)/layout.tsx scope
  - JarvisInput exposes JarvisInputHandle via React 19 ref-as-prop pattern (no forwardRef wrapper) + auto-registers focus fn at mount
  - JarvisConsole holds jarvisInputRef + passes it down (documents contract, enables future imperative actions)
  - CommandMenu trigger rebound from Cmd+K → Cmd+Shift+K with updated hint copy in the dialog header
  - app/(app)/template.tsx — motion/react 150ms opacity-only page transition (instant under prefers-reduced-motion)
  - globals.css JARVIS animation triad — @keyframes jarvis-queued-shimmer (scan-line sweep), jarvis-cursor-pulse (streaming caret blink + box-shadow glow), jarvis-scan-reveal (one-shot HUD wipe, 400ms)
  - globals.css prefers-reduced-motion block disabling all three JARVIS animations + view-transition durations
  - JarvisReceipt padding UI-SPEC §5a fix — compact px-2 py-1, default px-4 py-2 (+ SuggestedFactReceipt to px-4 py-2)
  - JarvisReceipt queued state uses jarvis-queued-shimmer (no more generic animate-pulse)
  - JarvisReceipt mount uses motion/react filter hue-rotate(160deg)→0deg holographic fade-in with useReducedMotion guard
  - JarvisScrollback wraps assistant turn body in relative+overflow-hidden anchor
  - JarvisScrollback renders jarvis-streaming-caret inline-at-end-of-prose while turn.status="streaming"
  - JarvisScrollback ScanRevealOverlay sub-component owns 400ms scan-line lifecycle on streaming→done transition
affects: [06-04-telemetry, 06-05-a11y]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level singleton for cross-tree focus dispatch — preferred over React Context for listener-deep-in-tree shapes (RESEARCH §5)"
    - "React 19 ref-as-prop on function components — no forwardRef wrapper required when ref appears in the Props interface"
    - "next/template.tsx (not layout.tsx) for per-navigation page transitions — re-mounts each navigation so motion.div re-runs its initial→animate sequence"
    - "useReducedMotion() hook + matching CSS @media (prefers-reduced-motion: reduce) block — defense in depth: JS-driven motion components and CSS-driven keyframes both honor the user preference"
    - "Holographic fade-in via motion/react filter channel (hue-rotate + brightness + saturate) — channel-isolated transition duration override so the filter resolves faster than the y-offset"
    - "Hooks called unconditionally before early returns — useReducedMotion() lives at the top of JarvisReceipt above the meta-not-found early-return"

key-files:
  created:
    - apps/web/lib/jarvis/focus.ts
    - apps/web/components/shell/GlobalHotkeys.tsx
    - apps/web/app/(app)/template.tsx
    - .planning/phases/06-polish/06-03-SUMMARY.md
  modified:
    - apps/web/app/(app)/layout.tsx
    - apps/web/app/globals.css
    - apps/web/components/jarvis/JarvisInput.tsx
    - apps/web/components/jarvis/JarvisConsole.tsx
    - apps/web/components/jarvis/JarvisReceipt.tsx
    - apps/web/components/jarvis/JarvisScrollback.tsx
    - apps/web/components/shell/CommandMenu.tsx

key-decisions:
  - "Cmd+K is reserved for JARVIS Console focus across all (app) routes (D-02, AES-05); CommandMenu rebound to Cmd+Shift+K"
  - "Module-level singleton (lib/jarvis/focus.ts) for Cmd+K dispatch rather than React Context — listener lives at layout depth, consumer lives deep in JARVIS Console subtree; Context would require lifting state above both"
  - "JarvisInput exposes a JarvisInputHandle via React 19 ref-as-prop (no forwardRef wrapper) for contract documentation + future imperative actions; the singleton remains the canonical Cmd+K dispatch path"
  - "Page transitions live in app/(app)/template.tsx (not layout.tsx) — template re-mounts on navigation so motion.div re-runs its initial→animate sequence each time"
  - "Pure opacity page fade, no y-offset — sliding pages feel disorienting in a dense OS tool (UI-SPEC §6c)"
  - "Reduced-motion handled at BOTH layers — useReducedMotion() in motion/react components + @media (prefers-reduced-motion: reduce) block disabling CSS keyframes"
  - "Receipt padding snapped to UI-SPEC §5a grid (compact px-2 py-1, default px-4 py-2); SuggestedFactReceipt also moved to px-4 py-2 even though plan only called out the main receipt — UI-SPEC §5a applies to all receipts"
  - "ScanRevealOverlay is a sub-component (not inline useEffect) so its lifecycle (mount on done, unmount after 400ms) is isolated from the parent's render loop"
  - "Holographic fade-in uses motion/react filter channel with per-channel duration override (filter resolves in 250ms inside the 300ms total) — produces the 'JARVIS bringing the element online' arc"

patterns-established:
  - "Plain Cmd+K → JARVIS focus; Cmd+Shift+K → CommandMenu (capture composer). No command palette overlay opens from Cmd+K anywhere in the app."
  - "Cross-tree imperative focus dispatch — module-level singleton over React Context when the listener and consumer don't share a natural parent"
  - "JARVIS-blue agent animations live in globals.css as opt-in className utilities (.jarvis-queued-shimmer, .jarvis-streaming-caret, .jarvis-scan-line) — never global, never auto-applied"

requirements-completed: [AES-03, AES-05]

# Metrics
duration: ~9min
completed: 2026-05-19
---

# Phase 06 Plan 03: JARVIS Console Polish Summary

**Cmd+K focuses the JARVIS Console input from anywhere in (app) via module-level singleton dispatch; CommandMenu rebound to Cmd+Shift+K; (app) routes fade between navigations in 150ms; queued receipts shimmer JARVIS-blue, streaming prose ends with a pulsing JARVIS-blue caret, completed turns sweep a one-shot scan-line top-to-bottom, and every receipt mounts with a holographic hue-rotate fade-in — all four animations skip cleanly under prefers-reduced-motion.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-19T02:29:15Z
- **Completed:** 2026-05-19T02:38:02Z
- **Tasks:** 3
- **Files modified:** 7 (+ 3 created)

## Accomplishments

- **Cmd+K focus delegation across (app) routes (AES-05, D-02):** Module-level singleton at `lib/jarvis/focus.ts` exposes `registerJarvisFocus(fn | null)` + `focusJarvis()`. JarvisInput auto-registers its focus function via `useEffect`. GlobalHotkeys mounts a single window keydown listener at `(app)/layout.tsx` scope, calling `e.preventDefault()` to suppress Chrome's address-bar default and dispatching to the singleton. No-op when JARVIS Console isn't mounted (e.g., on `/tasks`).
- **CommandMenu rebound to Cmd+Shift+K:** The cmdk-style keydown listener now requires `e.shiftKey`. The dialog header gained a `⌘⇧K` hint chip so users see the new binding at the point of use.
- **JarvisInput ref-as-prop (React 19):** Added `export interface JarvisInputHandle { focus(): void }` and an optional `ref?: React.Ref<JarvisInputHandle>` prop. No `forwardRef` wrapper. JarvisConsole holds a `jarvisInputRef` and passes it through — documents the contract and unlocks future imperative actions (focus-on-clarification-reply, focus-on-submit-error).
- **Page transitions via template.tsx (AES-03):** Created `app/(app)/template.tsx` wrapping children in a `motion.div` with `initial: { opacity: 0 } → animate: { opacity: 1 }` at 150ms `easeOut`. Pure opacity, no y-offset (per UI-SPEC §6c). `useReducedMotion()` → 0ms instant.
- **JARVIS-blue agent-mode animations (D-08, UI-SPEC §7):** Appended three keyframe sets + matching utility classes to `globals.css`:
  - `.jarvis-queued-shimmer` — 1.8s gradient sweep across the queued placeholder (replaces the generic Tailwind pulse on `JarvisReceipt`'s queued branch).
  - `.jarvis-streaming-caret` — 1.1s opacity + box-shadow pulse on a 2px JARVIS-blue caret, mounted inline at the end of `textDelta` while `turn.status === "streaming"`.
  - `.jarvis-scan-line` — 400ms one-shot top→bottom wipe with a JARVIS-blue gradient, mounted via `ScanRevealOverlay` on the streaming→done transition.
- **Holographic receipt fade-in (UI-SPEC §7d):** JarvisReceipt's `motion.div` now animates `filter: brightness(1.4) saturate(0.3) hue-rotate(160deg) → brightness(1) saturate(1) hue-rotate(0deg)` over 250ms inside a 300ms total — "JARVIS bringing the element online" metaphor. `useReducedMotion()` collapses both initial filter and y-offset to no-op.
- **Receipt padding fix (UI-SPEC §5a):** Compact variant `px-2.5 → px-2`, default variant `px-3 → px-4 py-2`. Both values on the 8px grid; the 2× compact-to-default horizontal ratio is preserved. SuggestedFactReceipt (jarvis_suggested fact branch) also moved from `px-3 py-2 → px-4 py-2` (plan only called out the main receipt explicitly, but UI-SPEC §5a applies to every receipt variant).
- **Reduced-motion fallbacks at every layer:** `@media (prefers-reduced-motion: reduce)` block in globals.css disables all three JARVIS animations (`animation: none !important`) plus view-transition durations; `useReducedMotion()` guards drive `motion/react` components (template.tsx, JarvisReceipt, ScanRevealOverlay).

## Task Commits

1. **Task 1: Cmd+K focus delegation (singleton + ref + GlobalHotkeys + CommandMenu rebind)** — `83e0d31` (feat)
2. **Task 2: Page transitions + JARVIS animations in globals.css + reduced-motion fallback** — `8e6be4f` (feat)
3. **Task 3: JarvisReceipt padding + animations wired into receipt + scrollback** — `35d9567` (feat)

## Files Created/Modified

**Created:**
- `apps/web/lib/jarvis/focus.ts` — Module-level singleton: `registerJarvisFocus(fn | null)` + `focusJarvis()`. Latest-write-wins semantics; no-op when unregistered.
- `apps/web/components/shell/GlobalHotkeys.tsx` — `'use client'` window keydown listener; matches plain Cmd+K (no shift) and dispatches via `focusJarvis()`. `e.preventDefault()` to suppress browser address-bar default.
- `apps/web/app/(app)/template.tsx` — `'use client'` motion/react opacity fade wrapper. Pure opacity. `useReducedMotion()` → 0ms.

**Modified:**
- `apps/web/app/(app)/layout.tsx` — Imported and mounted `<GlobalHotkeys />` inside `<QueryProvider>` as a sibling of `<AppShell>`, `<CommandMenu>`, and `<Toaster>`. Comment updated to note the new Cmd+K binding contract.
- `apps/web/app/globals.css` — Appended JARVIS animation block (three @keyframes + three utility classes) + `@media (prefers-reduced-motion: reduce)` override block. Added after the existing `.agent-glow-passive` rule.
- `apps/web/components/jarvis/JarvisInput.tsx` — Added `useImperativeHandle` import + `registerJarvisFocus` import; exported `JarvisInputHandle` interface; added `ref?: React.Ref<JarvisInputHandle>` to Props; added `useImperativeHandle(ref, ...)` and `useEffect` registering the focus function at the module level. All existing slash command + mention extensions logic unchanged.
- `apps/web/components/jarvis/JarvisConsole.tsx` — Imported `JarvisInputHandle` type alongside `JarvisInputPayload`; added `jarvisInputRef = useRef<JarvisInputHandle>(null)`; passed `ref={jarvisInputRef}` to `<JarvisInput />`. The singleton is the actual Cmd+K dispatch path; the ref documents the contract and unlocks future imperative actions.
- `apps/web/components/jarvis/JarvisReceipt.tsx` — Added `useReducedMotion` import; called the hook unconditionally at the top of the component; replaced `animate-pulse` → `jarvis-queued-shimmer` on the queued branch with `px-2 py-1`; updated containerCls padding to compact `px-2 py-1` + default `px-4 py-2`; updated `motion.div` initial/animate/transition to include the holographic filter channel with `shouldReduce` guards; updated SuggestedFactReceipt padding to `px-4 py-2`.
- `apps/web/components/jarvis/JarvisScrollback.tsx` — Added `useState` + `useReducedMotion` imports + `ScrollbackAssistantTurn` type import; wrapped the assistant turn body in `relative overflow-hidden`; appended `<span className="jarvis-streaming-caret" aria-hidden="true" />` inline at the end of `textDelta` while streaming; mounted `<ScanRevealOverlay status={turn.status} />` inside the turn container; added `ScanRevealOverlay` sub-component owning the 400ms scan-line lifecycle with `useReducedMotion()` guard.
- `apps/web/components/shell/CommandMenu.tsx` — Keydown listener now requires `e.shiftKey`; dialog header copy updated with a `⌘⇧K` hint chip; component-level comment updated to document the Phase 6 rebind.

## Cmd+K Binding Decision (where to find the updated hints)

| Binding | Behavior | Hint copy location |
|---|---|---|
| `Cmd+K` (Mac) / `Ctrl+K` (everywhere else) | Focus JARVIS Console input via `focusJarvis()` singleton dispatch | UI-SPEC §8b reserves the `⌘K` hint chip slot inside the JARVIS Console input wrapper — implementation deferred to a downstream pass (06-04 or 06-05); this plan owned the keybind wiring, not the visual hint |
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Open CommandMenu capture composer (cmdk dialog) | `apps/web/components/shell/CommandMenu.tsx` dialog header: `<div className="font-serif italic text-base px-4 py-3 border-b ...">Capture a thought <span className="font-mono text-xs text-muted-foreground opacity-60">⌘⇧K</span></div>` |

## Module-Level Singleton Rationale (vs. React Context)

The Cmd+K listener lives at `(app)/layout.tsx` (where `GlobalHotkeys` mounts). The consumer is `useEditor` deep inside `JarvisInput`, which is rendered inside `JarvisConsole`, which is rendered on the homescreen `/today` page.

A React Context implementation would require:
1. A `JarvisFocusContext` provider lifted above BOTH the listener and the consumer — i.e., at the layout level.
2. The provider holding the focus function in `useState` or a `useRef`.
3. `JarvisInput` doing `useContext(...).register(focusFn)` in a `useEffect`.
4. `GlobalHotkeys` doing `useContext(...).focus()` from its keydown handler.

The module-level singleton achieves the same dispatch in ~20 lines with zero React overhead, zero provider tree, and no risk of the consumer being remounted across context boundaries. Latest-write-wins is the desired behavior (there is only ever one JARVIS Console mounted at a time — homescreen only — so multiple registrations would only happen during dev StrictMode double-renders, where latest-wins is correct).

## JarvisInput Ref-As-Prop Pattern (React 19)

React 19 deprecated the `forwardRef` wrapper for function components — `ref` is now a regular prop. The shape used here:

```tsx
export interface JarvisInputHandle {
  focus(): void;
}

interface Props {
  // ... existing
  ref?: React.Ref<JarvisInputHandle>;
}

export function JarvisInput({ ref, ...existing }: Props) {
  // ... existing
  useImperativeHandle(ref, () => ({ focus() { editor?.commands.focus('end'); } }), [editor]);
  // ...
}
```

The Cmd+K dispatch does NOT use this ref — it uses the singleton. The ref is for explicit contract documentation and unlocks future imperative actions (focus-on-clarification-reply, focus-on-submit-error) without changing the prop surface again.

## template.tsx vs. layout.tsx Choice for Page Transitions

`layout.tsx` persists across route changes within the same route group — it only mounts once per app load, so a `motion.div` inside `layout.tsx` would only animate on initial load, never on subsequent navigations.

`template.tsx` re-renders on every navigation — Next.js explicitly designed this hook for per-navigation effects. `motion.div` inside `template.tsx` re-runs its `initial → animate` sequence each time, producing the desired 150ms fade-in on every route change.

Trade-off: `template.tsx` adds a re-mount cycle for the wrapped element on every navigation. For a 150ms opacity fade on a single `div` this is negligible; for heavier component trees (state, hooks) you would push the wrapper into a sub-component to isolate the remount.

## Reduced-Motion Guards (Full List)

**CSS classes (disabled inside `@media (prefers-reduced-motion: reduce)` via `animation: none !important`):**
- `.jarvis-queued-shimmer` (globals.css)
- `.jarvis-streaming-caret` (globals.css)
- `.jarvis-scan-line` (globals.css)

**View-transition fallback (disabled inside the same media block):**
- `::view-transition-old(*)`, `::view-transition-new(*)`, `::view-transition-group(*)` — `animation-duration: 0s !important; animation-delay: 0s !important;`

**motion/react components calling `useReducedMotion()` and branching on the return value:**
- `apps/web/app/(app)/template.tsx` — `AppTemplate` collapses transition `duration` to 0 when reduced.
- `apps/web/components/jarvis/JarvisReceipt.tsx` — `JarvisReceipt` collapses `initial.y` to 0, `initial.filter` to `'none'`, and `transition.duration` (both base and `filter:` override) to 0 when reduced.
- `apps/web/components/jarvis/JarvisScrollback.tsx` — `ScanRevealOverlay` returns `null` immediately when reduced (the scan line is never even mounted).

**Note:** `SuggestedFactReceipt` and the inner `motion.div` for the queued placeholder still use the older Phase 5 motion props (opacity + y, no filter); those are kept as-is because the holographic mount metaphor is for the *outcome* receipt, not the in-flight states, and Plan 06-03's `<action>` Step 1c explicitly scoped the holographic treatment to the resolved (post-queued) state.

## Receipt Padding Change Diff

Plan 5.1 quick-task `260518-mhu` (`ba33d49`) had introduced `px-2.5` (compact) and `px-3` (default) — both off-grid by 2px. UI-SPEC §5a (revision 2026-05-19) snapped these to the 8px grid:

| Variant | Pre (5.1 quick) | Post (06-03) | Delta |
|---|---|---|---|
| Compact | `border-l px-2.5 py-1 opacity-95` | `border-l px-2 py-1 opacity-95` | -2px horizontal (on-grid) |
| Default | `border-l-2 px-3 py-2` | `border-l-2 px-4 py-2` | +4px horizontal (on-grid, 2× compact) |
| SuggestedFactReceipt | `px-3 py-2` | `px-4 py-2` | +4px horizontal (matches default variant — UI-SPEC §5a applies to all receipts) |

Compact-to-default horizontal ratio is now exactly 2× (8px : 16px), preserving the visual weight distinction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance criterion miscalibration] `grep -c "y:" template.tsx returns 0`**
- **Found during:** Task 2 verification
- **Issue:** Plan acceptance criterion required `grep -c "y:" apps/web/app/(app)/template.tsx` to return 0 to confirm "pure opacity, no y-offset" per UI-SPEC §6c. Actual `grep -c "y:"` returns 2 because the substring `y:` appears inside `opacity:` (matches `cit` + `y:`). The semantic intent — no y-axis motion — is satisfied (no `y: <number>` value appears in any motion prop in the file; only `opacity: 0` and `opacity: 1`).
- **Fix:** Followed UI-SPEC §6c verbatim — pure opacity, no y-offset. The grep criterion is miscalibrated; canonical UI-SPEC is the source of truth. No change required to the implementation.
- **Verification:** `grep -n 'y:' apps/web/app/(app)/template.tsx` returns only the two `opacity:` lines (21 and 22), confirming no actual `y:` motion prop exists.

**2. [Rule 2 - Missing critical functionality] SuggestedFactReceipt padding also updated**
- **Found during:** Task 3 verification (the `grep -c "px-3" apps/web/components/jarvis/JarvisReceipt.tsx returns 0 OR is only present in non-receipt-padding context` criterion surfaced the lingering `px-3 py-2` on SuggestedFactReceipt at line 422)
- **Issue:** Plan's Step 1b only explicitly updated the main receipt's compact/default variants. SuggestedFactReceipt (jarvis_suggested fact branch) still used `px-3 py-2`, which is off-grid per UI-SPEC §5a and inconsistent with the rest of the receipt family.
- **Fix:** Updated SuggestedFactReceipt container className from `px-3 py-2` → `px-4 py-2`. Treating UI-SPEC §5a as universal-receipt rather than main-receipt-only — both are receipts in the JARVIS Console scrollback and visual consistency demands matched padding.
- **Files modified:** `apps/web/components/jarvis/JarvisReceipt.tsx` (SuggestedFactReceipt branch only)
- **Commit:** `35d9567`

**3. [Rule 3 - Blocker fix] ScanRevealOverlay status prop type**
- **Found during:** Task 3 typecheck
- **Issue:** Initially typed `ScanRevealOverlay`'s `status` prop as `ScrollbackTurn["status"]`, which fails because `ScrollbackUserTurn` doesn't have a `status` field (only `ScrollbackAssistantTurn` does). TypeScript errored: `Property 'status' does not exist on type 'ScrollbackTurn'`.
- **Fix:** Imported `ScrollbackAssistantTurn` type and changed prop type to `ScrollbackAssistantTurn["status"]`. The overlay is only ever mounted inside the assistant branch of the render loop, so the narrowed type is correct.
- **Files modified:** `apps/web/components/jarvis/JarvisScrollback.tsx`
- **Commit:** `35d9567` (rolled into Task 3 commit)

**4. [Rule 1 - Stale comment cleanup] JarvisReceipt component-level docstring referenced obsolete `animate-pulse` and `px-2.5` / `px-3`**
- **Found during:** Task 3 verification (`grep -c "animate-pulse"` returned 2; `grep -c "px-2.5"` returned 1; `grep -c "px-3"` returned 2 — all in docstrings, not active code)
- **Issue:** Stale comments referencing the pre-06-03 implementation would have caused future readers to chase phantom code paths.
- **Fix:** Rewrote the three stale comment passages to describe the post-06-03 implementation (jarvis-queued-shimmer; compact px-2 py-1; default px-4 py-2). Behavior unchanged.
- **Files modified:** `apps/web/components/jarvis/JarvisReceipt.tsx`
- **Commit:** `35d9567`

---

**Total deviations:** 4 (1 acceptance criterion miscalibration noted only; 1 rule-2 scope expansion; 1 rule-3 typecheck fix; 1 rule-1 stale-comment cleanup)
**Impact on plan:** Zero functional regressions. All UI-SPEC contracts honored (often more strictly than the plan literally required). Plan acceptance criterion #1 (the `y:` grep) is a known-miscalibrated check whose semantic intent is satisfied.

## Issues Encountered

- **TasksClient.tsx pre-existing typecheck error noise.** During Task 3's typecheck run, an error surfaced in `apps/web/components/tasks/TasksClient.tsx:325` related to Plan 06-02's parallel work (sonner Undo toast handler type mismatch with `deleteTask` return type). This is in 06-02's territory, not 06-03's. The error self-resolved during the next typecheck run (06-02 fixed it independently or the narrowing changed). No deferred-items file needed — issue did not persist.

## Open Items Downstream

- **Cmd+K hint chip (UI-SPEC §8b).** The `⌘K` hint chip rendering inside the JARVIS Console input wrapper (right-aligned `<kbd className="font-mono text-xs text-muted-foreground opacity-50 hidden md:inline">⌘K</kbd>`) is spec'd but not implemented — this plan owned the keybind wiring + GlobalHotkeys + singleton. Defer the visual hint to 06-05 (a11y sweep) where the full ARIA labeling pass already touches keyboard shortcut copy.
- **JARVIS Console greeting + thinking-word copy.** "Good evening, sir. What shall we file?" (greeting) and the thinking-word indicator's word list still use Phase 5 copy. Brand-voice audit per AES-04 will verify both during 06-05.
- **JARVIS-blue contrast on light theme.** UI-SPEC §11b warns that `#00d4ff` may fail 3:1 contrast on parchment light-mode backgrounds. The streaming caret + scan line are visible in dark theme; the queued shimmer's blue gradient (max alpha 0.25) and the scan line's max alpha 0.7 may need substitution with `#009bb5` on light theme. Audit deferred to 06-05.
- **Holographic fade-in not applied to SuggestedFactReceipt's motion.div.** Only the main receipt got the filter/hue-rotate treatment. SuggestedFactReceipt still uses the Phase 5 `opacity + y: 4 → 0` mount. Could be unified in a future polish pass; intentionally not done here because the plan's Step 1c specifically scoped the holographic treatment to the resolved (post-queued) state on the main receipt and SuggestedFactReceipt is a distinct branch with its own Keep/Discard UX.
- **`agent-mode-only` scope of JARVIS animations is implicit.** The JARVIS animations are only used inside JarvisReceipt + JarvisScrollback, and both components render only inside JarvisConsole, which renders only on `/today` (an agent-mode route per UI-SPEC §1). So the "agent-mode only" rule is satisfied by component co-location. There is no runtime guard preventing future misuse — if a Journal-mode component imports `jarvis-queued-shimmer`, nothing stops it. Acceptable for v1; document as a convention.

## User Setup Required

None. All changes are client-side React + CSS; no env vars, no DB migrations, no external service config.

## Self-Check: PASSED

All 3 created files exist on disk:
- `apps/web/lib/jarvis/focus.ts` — FOUND
- `apps/web/components/shell/GlobalHotkeys.tsx` — FOUND
- `apps/web/app/(app)/template.tsx` — FOUND

All 7 modified files exist on disk and contain the expected changes (verified via grep counts above).

All 3 task commit hashes verified present in `git log --oneline -5`:
- `83e0d31` — feat(06-03): Cmd+K focus delegation
- `8e6be4f` — feat(06-03): page transitions + JARVIS-blue animations
- `35d9567` — feat(06-03): JarvisReceipt padding + animations wired

`pnpm --filter web typecheck` exits 0. `pnpm --filter web test` passes 237/237 (1 skipped). `pnpm --filter web build` succeeds.

## Next Phase Readiness

- **JARVIS animation tokens consumed by JarvisReceipt + JarvisScrollback.** 06-04 (/insights telemetry) can layer the `.agent-glow-passive` utility on chart panel wrappers + status badges, and reuse the `useReducedMotion` pattern for recharts `isAnimationActive={!shouldReduce}`.
- **Cmd+K binding finalized.** 06-05 a11y sweep can render the `⌘K` hint chip in the JARVIS Console input wrapper + the AppShell tooltip for the JARVIS nav link with confidence that the binding contract won't change.
- **Page transition baseline live.** 06-04 (/insights) and any new routes in 06-05 inherit the 150ms opacity fade automatically — no per-route work required.
- **No blockers.** Production build green; typecheck clean; tests green; deferred-items file empty/unneeded.

---
*Phase: 06-polish*
*Completed: 2026-05-19*
