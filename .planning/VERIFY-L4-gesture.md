# VERIFY — L4-C `gesture-tap-confirm`

Tap-to-click, four-finger-curl scroll, cursor z-order, everything-hand-clickable,
and a thumbs-up/down send-confirm gesture + on-screen confirm panel.

## Automated verification (all green)

- `pnpm --filter desktop typecheck` — clean (tsc --noEmit).
- `pnpm --filter desktop test` — 145 tests pass across 22 files, including the
  new suites below.
- `npx vite build` (in apps/desktop) — builds clean. (Warnings about chunk size
  and env.ts dynamic-import are pre-existing, not from this unit.)
- **No Rust touched.** The four-finger scroll reuses the existing
  `scrollStart/scrollMove/scrollEnd` phase → `scrollNativeWebview` →
  `studio_webview_scroll` IPC, which the sibling wave already shipped
  (`native-webview.ts:86`, `studio_webview.rs:160`). `cargo check` deliberately
  NOT run (disk-constrained; nothing Rust changed).

### New unit tests (pure state machines + math)

- `tap-click-recognizer.test.ts` (10) — dip→recover fires a tap; a sustained
  forward hold (a drag) never clicks; shallow wobble ignored; double-bounce
  debounced by the refractory window; re-seeds across a disengage; reset silent.
- `four-finger-scroll-recognizer.test.ts` (9) — curl (openness drop) scrolls
  down, uncurl scrolls up; velocity deadband rejects a slow drift; maxStep clamp;
  scrollEnd on falling edge and on reset.
- `thumb-confirm-recognizer.test.ts` (8) — a sustained (~400ms) thumbs-up fires
  `confirmApprove`, thumbs-down fires `confirmCancel`; a brief/passing thumb does
  NOT fire; fires once per hold; up→down flip re-anchors the dwell; re-arms after
  leaving the pose.
- `gesture-thumb.test.ts` (15) — `computeThumbExtension` / `computeThumbVertical`
  / `computeThumbGesture` / `computeIndexTipDepth`: sign, scale/depth-invariance,
  degenerate-palm guards, custom thresholds.
- `hub-intents.test.ts` (6) — hub upgrades `tap`/`expand` from hover, drops a
  targetless `tap`, and passes `confirmApprove`/`confirmCancel`/`halt` through
  unchanged.
- `confirm-gate.test.ts` (5) — hold → pending=true; `confirmPendingSend()`
  dispatches + resolves "sent"; `cancelPendingSend()` resolves "cancelled";
  both no-op (false) with nothing pending.

## Manual smoke — CAMERA-DEPENDENT (needs a physical webcam; not runnable here)

Toggle hand tracking (⌘⇧H) and, in front of the camera:

1. **Tap-to-click (primary click).** Point at a widget button / drawer entry /
   news row / WhatsApp chat and JAB the index finger forward toward the camera,
   then pull back. Expect: the element clicks (reticle plays a pop/expand
   flourish). Confirm a sustained forward *hold* (as in a drag) does NOT click.
2. **Four-finger-curl scroll (primary scroll).** Over a scrollable widget
   (news / WhatsApp / a promoted browser), palm out and curl the four fingers
   down → content scrolls down; uncurl → up. Confirm a steady open hand does not
   drift-scroll, and that scrolling doesn't fight cursor aiming.
3. **Cursor z-order.** Move the reticle over the drawer, over widgets, and over
   the confirm panel. The brass reticle must render ABOVE all of them (it was
   z35, behind the z40 drawer; now z60). Verify it never eats clicks
   (pointer-events: none).
4. **Everything hand-clickable.** With tap-to-click, verify chrome buttons
   (close / stow / pin), drawer catalog tiles, stowed chips, news items, and
   WhatsApp chats all respond. Flag any hit target that feels < ~32px.
5. **Confirm-gesture flow.** Ask JARVIS to send a message so the confirm gate
   holds it. Expect the bottom-center panel: "Awaiting confirmation · 👍 approve
   · 👎 cancel" with a subtle pulse. Hold a thumbs-UP ~0.4s → the send fires and
   the panel dismisses with a green ✓ "Sent". Repeat and hold thumbs-DOWN →
   the send cancels, panel dismisses with a red ✕ "Cancelled". Confirm a hand
   waving past does NOT trigger a send (the ~400ms hold guards it). Confirm VOICE
   yes/no still works simultaneously (say "yes"/"no" while the panel is up).

## Notes / risks for integration

- **tap vs index-scroll coexistence:** both engage on the point pose but read
  orthogonal axes (tap = index-tip z depth; index-scroll = fingertip ny). They
  separate cleanly in the math, but tune `dipThreshold` / `minVelocity` against a
  real camera if either misfires. `computeIndexTipDepth` relies on MediaPipe's
  per-landmark z; if z proves noisy on-device, raise `dipThreshold` or add
  smoothing (a fresh OneEuro on the depth signal in gesture-core).
- **four-finger scroll vs open-hand resize** (sibling-owned): both engage on an
  open palm. They separate by dynamics — a fast curl trips scroll's velocity gate
  (0.9/s) before resize's 300ms arm dwell; a slow steady hold arms resize below
  scroll's gate. Verify on-camera that a deliberate resize doesn't stutter-scroll.
- Files owned/edited: `studio/input/{tap-click,four-finger-scroll,thumb-confirm}-recognizer.ts`
  (+ tests), `studio/input/hand/gesture-core.ts` (thumb + index-depth math,
  recognizer wiring), `studio/input/{types,hub,pointer-synth}.ts`,
  `studio/cursor/{StudioHandReticle,ConfirmGesturePanel}.tsx`,
  `studio/input/HandTrackingLayer.tsx`, `actions/confirm-gate.ts` (programmatic
  confirm/cancel + resolution emitter). Drawer.tsx / WidgetWindowLayer.tsx /
  WhatsApp widget internals untouched (siblings own them).

---

## Finisher evidence — palm-click coexistence (2026-07-12)

Commit `72adbe77` — `feat(studio): coexist four-finger scroll + open-hand resize with palm-click`.

Palm-click (close-then-open) had already been added (`d9b810ba`) and wired into
gesture-core, with the cursor already frozen while the fist is held (so the aim
stays at the pre-close point) and the `tap` intent already flowing through
pointer-synth's pointerdown/up + the reticle click-pop. This finisher closed the
remaining coexistence gaps:

- **(a) scroll vs the click's fast close** — new pure `createScrollCurlGate`
  (gesture-core). Four-finger scroll is a candidate ONLY while the hand is
  actively curling (openness dipped below `scrollArmOpennessCeil` = 1.6 yet still
  at/above the closed band 1.35) and engages only after that candidate holds
  `scrollCurlSustainMs` = 250ms. A <600ms close-open round trip never survives
  the dwell, so it yields zero scroll deltas; a held-open hand is never a
  candidate. The old bare `scrollCandidateSince` stub was replaced by this gate.
- **(b) resize disarms during a click** — new pure `resizeEngageAllowed`
  (gesture-core), applied at the `openHandResize.push` site: disarms while
  `palmClick.state === "closing"` and once the hand curls into the closed band,
  so the closing fist never reads as a shrink. A normal shrink stays above the
  closed band, so it is unaffected.
- **(c) index-jab retired as a click source** — already structural
  (`tap-click-recognizer.ts` is gone, palm-click is the sole `tap`). Updated the
  stale `computeIndexTipDepth` doc to say it is a KEPT shared geometry helper no
  longer wired to any recognizer.
- **(d)/(e)** — verified already wired: `pointer-synth.ts` dispatches
  pointerdown+up+click for the `tap` intent at the frozen reticle point
  (cursor emission is gated to `pose === "open" || "point"`, so it stays frozen
  while the palm is closed), and `StudioHandReticle` pops on `tap` (`isPop`).

Tests: `src/studio/input/hand/gesture-click-gates.test.ts` (13 new) covers the
scroll-gate dwell + zero-delta round trip + end-to-end with the real
FourFingerScrollRecognizer, the resize disarm predicate, and the jab retirement.

Verification (from `apps/desktop`): `pnpm typecheck` → exit 0; `pnpm vitest run`
→ exit 0 (27 files, 239 tests); `pnpm vite build` → exit 0.

Camera-dependent manual smoke:
- `scrollArmOpennessCeil` (1.6) is tuned blind. Confirm a deliberate four-finger
  beckon still arms scroll on the real camera (curl must bring openness below 1.6
  while the pose still reads open); raise the ceil toward 1.7 if scroll feels hard
  to start, lower it if a held-open hand ever scrolls on its own.
- Confirm a palm-click over a scrollable widget produces no visible scroll jump.
- Confirm a click while an open-hand resize is armed does not shrink the widget.
