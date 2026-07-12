# VERIFY — L4-D `hud-shell-polish`

Worktree `../hp-wt-l4-shell`, branch `l4/shell-u`. Desktop HUD chrome polish:
right-edge widget picker, orb drag whiplash fix, drop/send sounds, settings gear
fix, and removal of the synthetic wake user turn.

## Commits (oldest → newest)

- `8e1a3a38` feat(desktop): HUD sound layer + Sound settings toggle
- `648e858e` feat(desktop): soft pop on widget drop, summon, and restore
- `cdd2ad09` feat(desktop): send cue on confirmed outgoing message
- `f16706ee` fix(desktop): eliminate orb drag-drop whiplash
- `86e381fb` fix(desktop): stop the briefing injecting a fake wake user turn
- `4f89ec1f` fix(desktop): make the settings gear clickable and open the Settings widget
- `2ce7b61b` feat(desktop): right-edge hover-expand widget picker (notification-center style)

## Verification

- `pnpm typecheck` — PASS (tsc --noEmit clean).
- `pnpm vitest run` — PASS (16 files, 92 tests).
- `pnpm vite build` — PASS (built in ~5s; pre-existing >500kB chunk warning only).
  Both mp3 assets emit to `dist/pop.mp3` and `dist/message-sent.mp3`.
- Visual: ran own `vite dev --port 1520` inside the worktree and screenshotted
  the expanded picker (right-edge slide-out, large icon+label+preview cards,
  scrollable, stowed section on top, Talk-to-JARVIS alone at bottom-center, gear
  clear at top-right). Killed the dev server and cleaned `dist/` after.

## Item-by-item

1. **Right-edge hover-expand picker** — `Drawer.tsx` rewritten: slim right-edge
   hover zone; entering (mouse OR synthetic hand pointer) slides the panel out
   leftward (`x: 100% → 0`, notification-center feel); leaving collapses after a
   400ms grace; a drag-near (`targeted`) force-holds it open. Cards are large
   (≥72px rows), hand-friendly, with an icon tile + label + a stylized mini
   preview block per kind (`CardPreview`, never a live instance), scrollable with
   a cyan thin scrollbar (`.studio-custom-scroll`). Stowed-chip restore section
   pinned on top. Bottom tab removed by relocation → Talk-to-JARVIS owns
   bottom-center. `isNearDrawer` in `WidgetWindow.tsx` made position-agnostic so
   drag-to-stow still works against the right-edge drawer. Reduced-motion drops
   the slide.

2. **Orb drag whiplash — ROOT CAUSE + fix.** The orb (a `permanent` widget) was
   positioned via `animate={{ left: item.x }}` PLUS a `layoutId`, while the drag
   applied geometry imperatively through `applyWindowGeometry`. Motion's internal
   animation target therefore never saw the drag. On release the spring first
   snapped the orb back to its pre-drag ORIGIN (its last known `animate` target),
   then jumped to the drop point once `moveWidget` committed new state — the
   visible back-snap-then-jump. Fix (`WidgetWindow.tsx`): drive the permanent
   widget's `left/top/width/height` through shared `useMotionValue`s. The drag
   sets them directly (1:1 tracking, no spring); a settle `useEffect` springs
   them to the committed geometry only AFTER the drag lock (`draggingRef`)
   releases, starting from exactly where the orb was let go. Dropped the orb's
   `layoutId` (it never stows, so it needs no shared-element transition and it
   was replaying a layout animation from the stale box on every drop).

3. **Drop pop sound** — reused the web app's `pop.mp3` (its tab-change cue),
   bundled to `apps/desktop/public/pop.mp3`. New `studio/sound/studio-sfx.ts`
   plays it on widget drop (settle), summon, and stowed-chip restore. Gated on a
   new persisted `soundEnabled` HUD setting + `prefers-reduced-motion`. Volume
   0.35, single reused Audio element, failures swallowed.

4. **Send sound (coordinator addition)** — reused the web app's `message-sent.mp3`
   ("send to JARVIS" cue), bundled locally. Wired at the true dispatch point: the
   confirm-gate's `result.ok` block now emits a transport-agnostic `onMessageSent`
   event (fires for BOTH WhatsApp and iMessage confirmed sends), which `main.ts`
   plays the send cue on. Same mute/reduced-motion discipline. `confirm-gate.ts`
   lives in `actions/` (not a WhatsApp widget internal or gesture file), so no
   sibling-owned file was touched.

5. **Settings gear unclickable — ROOT CAUSE + fix.** `.gear-btn` had no
   z-index, so the studio layers (`#studio-widget-root` at z-index 2 and its
   foreground scrims) painted above it and swallowed the click. Fix (`index.html`):
   lift the gear above the studio stack (`z-index: 70; pointer-events: auto`).
   Re-pointed the gear from toggling the legacy DOM settings sheet to summoning
   the singleton Settings widget via a shared `openSettingsWidget` helper
   (`studio/actions/open-settings.ts`), reachable by mouse and the synthetic hand
   pointer alike. The legacy DOM sheet stays wired for its close button and the
   disconnect banner's device-token recovery. Added a Sound toggle row to the
   Settings widget for the new setting.

6. **Removed the hardcoded wake turn.** The briefing fires by POSTing a synthetic
   "Daddy's home. Give me my briefing, sir." prompt, which the server echoes back
   as a user transcript turn the HUD painted as a message the user never typed.
   `briefing.ts` now arms an echo suppressor around the POST; `main.ts`'s
   `paintTranscriptDeduped` drops exactly that one prompt echo (exact,
   whitespace-normalized match, auto-disarming after 12s so a later genuine
   utterance is never swallowed). Wake still triggers the spoken briefing and
   listening — only the phantom bubble is gone.

## Ownership / hand-off notes for the conductor

- Stayed within scope: touched only `Drawer.tsx`, `WidgetWindow`, `WidgetWindowLayer`
  (untouched — Props contract preserved), `main.ts`, `studio.css`, `index.html`,
  `hud-settings.ts`, `SettingsWidget.tsx`, `briefing.ts`, `confirm-gate.ts`
  (actions, not a widget internal), plus new `sound/studio-sfx.ts` and
  `actions/open-settings.ts` and the two bundled mp3 assets. Did NOT touch
  `src/studio/input/*` gesture recognizers or WhatsApp widget internals.
- The send-sound hook uses the EXISTING confirm-gate event pattern from my side
  (new `onMessageSent`), so nothing sibling-owned needed editing. No merge-time
  wiring required.
- No push (per instructions).
