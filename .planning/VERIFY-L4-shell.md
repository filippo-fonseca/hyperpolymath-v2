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

---

# VERIFY — voice-ux trio (2026-07-12)

Worktree `hp-wt-studio-integration`, branch `bgsd/studio-native`. Three targeted
voice-UX fixes plus two coordinator-added fixes surfaced by live transcript
evidence (confirm-gate deadlock, briefing double-fire). `apps/desktop` only —
`src/studio/input/` (owned by a sibling agent, mid-refactor in the same shared
working tree) was read-only, never edited.

## Commits (oldest → newest)

- `16b74458` fix(desktop): arm the mic in parallel with the orb-fly, not after it
- `285e0867` fix(desktop): stop the unrequested "Good morning, sir" greeting on wake
- `dee5fb59` fix(desktop): confirm-gate no longer deadlocks on unrelated turns

## Verification

- `pnpm typecheck` — PASS (tsc --noEmit clean).
- `pnpm vitest run` — PASS (26 files, 221 tests; +15 in `confirm-gate.test.ts`,
  up from 5 pre-existing).
- `pnpm vite build` — PASS (built in ~2.5–3.4s; same pre-existing >500kB chunk
  + duplicate-`jsx`-key warnings only, unrelated to this work).

## Item-by-item

1. **Talk-to-JARVIS needed two clicks — ROOT CAUSE + fix.** `startCaptureTurn()`
   (`src/audio/capture.ts`) `await`ed `postClaim()` — a best-effort,
   non-fatal telemetry POST — BEFORE registering the `audio-chunk` listener,
   calling `invoke("start_capture")`, and flipping capture state to
   `"recording"`. Meanwhile the conversation FSM's `jarvisState` flips to
   `"listening"` (which flies the orb) synchronously in the caller, one await
   earlier. So the first click showed the orb fly immediately while the mic
   was still a network round trip away from actually recording; speech
   spoken into that gap was lost, reading as "click Talk to JARVIS again."
   Fix: fire `postClaim()` without awaiting it (`void postClaim()`) so mic-arm
   and orb-fly land in the same click. `postClaim`'s own docstring already
   documented it as tolerant of failure, so this is a pure ordering fix, not a
   behavior change.

2. **Fallback voice + degraded chip latch — AUDITED, found already correct.**
   Traced `tts-player.ts`'s `playSentence()`: it already retries the cloud
   ElevenLabs route on EVERY sentence (no memoized/latched "stay on fallback"
   flag) and calls `setVoiceStatus({ state: "ok" })` unconditionally on the
   first successful response after a failure. `paintVoiceStatus` (`main.ts`)
   and the FSM/sequencer all share the SAME `ttsPlayer` singleton exported
   from `jarvis-response.ts` (verified no second instance exists), so the chip
   listener and the retry logic observe the same state machine. No code
   change was needed here — the reported symptom (stuck on fallback + stale
   chip after a transient TTS outage) did not reproduce from the source; it
   most likely was resolved by an unrelated fix already on this branch, or was
   a one-off during the hot-reload blip itself. Flagging for the coordinator
   to re-check live if it recurs.

3. **Removed the uninvited "Good morning, sir" greeting — ROOT CAUSE + fix.**
   `86e381fb` (earlier commit) suppressed the fake USER echo turn but left the
   ASSISTANT side: `startupBriefingEnabled` (`settings.ts`) defaulted to
   `true`, so `maybeRunStartupSequence()` (`startup/sequencer.ts`) spoke a
   proactive briefing on literally every first invoke of a session, unasked.
   Flipped the default to `false` (settings.ts, index.html checkbox + note,
   sequencer.ts doc comment) so the briefing is now opt-in only — waking/
   talking starts with a clean transcript unless the user explicitly turns the
   setting on. Audited for a second/repeated auto-fire path per the
   coordinator's report of a briefing firing "alongside a normal turn, twice"
   at 9:43: `runBriefing()` has exactly ONE call site
   (`sequencer.ts:maybeRunStartupSequence`), gated by both the settings flag
   AND a module-level `_startupRan` once-per-session latch that is never
   reset. No client-side path re-invokes it mid-conversation. The observed
   "Good morning **again**, sir" phrasing points at the server-side agent's
   own greeting/personality logic re-improvising a greeting in a normal
   reply — outside `apps/desktop`'s scope to fix directly; defaulting the
   client-side trigger off removes the client half of the double-fire
   entirely.

4. **Confirm-gate deadlock on unrelated turns — ROOT CAUSE + fix**
   (`actions/confirm-gate.ts`, coordinator addition). A pending
   `send_message` confirmation ("shall I send it, sir?") had a 120s TTL and,
   critically, `resolvePendingWithTranscript` silently ignored any transcript
   that was neither an affirmative nor a decline — `pending` (and its amber
   HUD ring) just sat there. A genuine unrelated follow-up right after a
   pending send read as JARVIS having stopped responding until the full
   2-minute TTL finally lapsed. Fixes: (a) `PENDING_TTL_MS` 120s → 45s, and
   the TTL-expiry path now speaks "No confirmation, sir — cancelled." via
   `ttsPlayer.speakNow` (new `speak` param threaded through `discardPending`);
   (b) an unrelated (non-affirm, non-negate) transcript now calls
   `discardPending(...)` to drop the stale pending instead of leaving it
   hanging, so the new turn is free to run normally; (c) verified the
   affirmative matcher (`AFFIRM_RE`) already covers yes/yeah/yep/yup/sure/
   ok(ay)/do it/go ahead/etc. — no change needed there, added regression
   coverage instead. Added `confirm-gate.test.ts` coverage: an
   `it.each` over 7 affirmatives, one negative-path test, one unrelated-turn
   test, and one fake-timers TTL test (asserts still-pending at 44s, cleared
   + `"expired"` + the spoken line at 45s).

## Ownership / hand-off notes for the conductor

- Touched only `src/audio/capture.ts`, `src/settings.ts`,
  `src/startup/sequencer.ts`, `index.html`, `src/actions/confirm-gate.ts`,
  `src/actions/confirm-gate.test.ts`. Did NOT touch `src/studio/input/*`
  (sibling agent's live territory — confirmed via `git status` before AND
  after each commit that only these six files landed).
- Hazard hit and resolved: the shared working tree had two files
  (`src/studio/input/tap-click-recognizer.{ts,test.ts}`) already
  index-staged as deletions by the sibling agent's in-flight refactor. My
  first commit (pathspec-scoped to `capture.ts` only) still swept them in
  because they were already in the index, not because of my `git add`.
  Caught it immediately via `git show --stat HEAD`, restored both files'
  contents from `HEAD~1` back into the working tree as unstaged/untracked
  (matching their pre-commit state exactly, without re-staging them), and
  proceeded — verified via `git status --short` before every subsequent
  commit that only my intended files were staged.
- Item 2 (voice fallback/chip) needed no code change — see write-up above.
  Worth a live re-check if the symptom recurs.
- Item 5 (briefing double-fire) is very likely partially server-side (the
  agent's own greeting phrasing); the client-side trigger is now off by
  default, which should eliminate it in practice, but the "again" wording
  in the reported transcript suggests a backend-side follow-up may still be
  worth a look outside this worktree's scope.
- No push (per instructions).

---

## Finisher evidence — drawer rail hand-hover (2026-07-12)

Commit `42afa96c` — `feat(studio): hand-pointer hover opens the right-edge drawer rail`.

The collapsed right-edge rail already expanded on real-mouse hover
(`onPointerEnter`/`onPointerLeave` on the rail + aside). But the synthetic hand
pointer (id 90210) never dispatches pointerenter/leave for a BARE hover — the hub
resolves hover purely from cursor position (confirmed in `pointer-synth.ts`;
enter/leave are only synthesized during an active grab/click). So the hand could
never open the picker by hovering.

Fix (Drawer.tsx):
- A `requestAnimationFrame` poll reads the always-present reticle DOM node
  (`[data-studio-reticle][data-reticle-visible="true"]`, a 0x0 node positioned at
  the cursor, so its `getBoundingClientRect()` gives the cursor's viewport point)
  and rect-hit-tests it against the rail (collapsed) or the whole aside
  (expanded), driving the SAME `openNow` / `scheduleCollapse` the mouse uses — so
  the 400ms collapse grace, the `targeted` drag-hold, and reduced-motion behavior
  are identical across mouse and hand. For a real mouse the reticle is hidden
  (`data-reticle-visible="false"`), so the poll is inert and the native handlers
  drive it — no double-driving.
- The rail is floored at `>=40%` of the stage height (min 128px), tracked by a
  `ResizeObserver` on `[data-studio-stage]`, so a jittery hand has a tall target.

No clicks are required to open/close (hover drives it); the entry click/tap and
drag-out still summon. Rail keeps its slim ~22px width, always-visible collapsed
state, cyan hairline grip + faint approach glow.

Verification (from `apps/desktop`): `pnpm typecheck` → exit 0; `pnpm vitest run`
→ exit 0 (27 files, 239 tests); `pnpm vite build` → exit 0.

Camera-dependent manual smoke:
- With the hand tracker running, sweep the reticle to the right edge and confirm
  the picker expands leftward, and that leaving it collapses after ~400ms.
- Confirm a real mouse still opens/closes the rail exactly as before.
- Confirm reduced-motion shows/hides the panel instantly.
