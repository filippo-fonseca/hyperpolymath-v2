# Gesture catalog

Every hand gesture the Studio ships, what fires it, and what starves it.

This file lives next to the code, not in `docs/`, deliberately: the failure mode
here has always been documentation drifting out from under the constants, and a
catalog in `docs/` drifts quietly. Here it drifts in the same review as the
change.

**The threshold tables are enforced.** `GESTURES.md.test.ts` parses every
`Constant | Value | Gates | Source` row below and asserts it against the live
`DEFAULT_*` object it cites — and asserts the reverse, that every numeric knob in
those objects appears here. A retune that skips this file fails the suite. Change
the number and the row together.

Source cells read `file.ts:SYMBOL`, relative to this directory.

---

## Per-frame push order

`gesture-core.ts`'s interpreter pushes every recognizer each frame, in this
order. Order matters where one recognizer reads another's state from the same
frame (noted per gesture):

```
pinchDolly → pinchDrag → pinchHold → halt → pinchBloom → openHandResize →
indexScroll → fistScroll → fourFingerScroll → palmClick → thumbConfirm →
swipe → collapse → cursor
```

Recognizers before the `pinchActive` early-return run on every frame, so their
falling edges always fire. `swipe`, `collapse`, and the cursor sit after it and
are skipped entirely while a pinch is engaged.

## The three families

The families are mutually exclusive by pose, which is the top-level arbitration:

- **open / point** — the cursor tracks the index fingertip (steering).
- **pinch** (thumb+index) — camera navigation; the cursor FREEZES.
- **fist** — close-only: swipe, scroll, collapse, palm-click.

---

## 1. pinch-dolly — camera dolly

**Trigger.** While pinched, move your hand toward or away from the camera. Not a
gesture in its own right: it is the depth half of a pinch-drag.

**Phases.** Baseline captured on pinch-engage (z = 0 there by construction, so no
lurch) → armed once the change clears `deadzone` → eases back to 0 below
`exitDeadzone` → frozen while the pinch is releasing → reset on release.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `deadzone` | `0.04` | Octaves of palm-size change before the dolly arms; jitter never dollies | `pinch-dolly.ts:DEFAULT_PINCH_DOLLY` |
| `exitDeadzone` | `0.02` | Disarm floor (< `deadzone`) — the knee hysteresis that stops toggle-chatter | `pinch-dolly.ts:DEFAULT_PINCH_DOLLY` |
| `gain` | `2` | Octaves → dolly scale; a ~1.4x palm approach sweeps the full ±1 | `pinch-dolly.ts:DEFAULT_PINCH_DOLLY` |
| `emitQuantum` | `0.015` | Minimum z change worth reporting; a still hand holds a constant z so the rig settles | `pinch-dolly.ts:DEFAULT_PINCH_DOLLY` |

**Effect.** An absolute scalar `z ∈ [-1, +1]` into pinch-drag's `depth` channel →
`dragMove.dz` → camera dolly. Palm grows (hand nearer) ⇒ positive ⇒ dolly in.

**Scope.** camera/world.

**Arbitration.** Rides `pinchActive`; nothing else contends for palm size. Frozen
while `unpinchSince` is set, so opening the hand can't lurch the camera.

**Tests.** `pinch-dolly.test.ts` (16).

---

## 2. pinch-drag — camera pan

**Trigger.** Pinch and move your hand. The world moves with you.

**Phases.** Rising edge of the pinch anchors an origin and emits `dragStart` →
`dragMove` per engaged frame with the CUMULATIVE delta → `dragEnd` on release.

**Thresholds.** None. This recognizer holds **zero literals**: every gate
(engage, release grace, shape validity) is upstream in `gesture-core.ts`. It
only diffs the samples it is handed.

**Effect.** `dragStart` / `dragMove{dx, dy, dz}` / `dragEnd` → camera pan (dx/dy
from the smoothed palm centroid) + dolly (dz from pinch-dolly).

**Scope.** camera/world.

**Arbitration.** Rides `pinchActive`. Survives a MediaPipe dropout up to
`pinchLostGraceMs` without re-anchoring (see §14).

**Tests.** None (pure delta arithmetic, no thresholds of its own).

---

## 3. pinch-hold — grab a widget

**Trigger.** Pinch over a widget and keep pinching. After a beat it is yours to
drag.

**Phases.** Rising edge records the origin time → at `grabHoldMs` of continuous
engagement emits `grabStart` + `grabMove` → `grabMove` per frame → `grabEnd` on
release. A release before the threshold emits nothing.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `grabHoldMs` | `350` | Continuous pinch dwell that commits a grab. SHARED with pinch-bloom — this single number splits tap from grab | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `holdMs` | `350` | The recognizer's own default. NOT the live value: gesture-core always passes `grabHoldMs`. Kept in sync so the module doesn't misreport | `pinch-hold-recognizer.ts:DEFAULT_PINCH_HOLD` |

**Effect.** `grabStart` (hub injects the hovered widget) / `grabMove{nx, ny}` /
`grabEnd` → widget drag, drag-into-zone, or corner-resize via pointer-synth.

**Scope.** widget (hub upgrades the targetless start from hover).

**Arbitration.** Exactly mutually exclusive with pinch-bloom by the shared
`grabHoldMs`: still pinched at T ⇒ grab, released before T ⇒ tap. No race, no
overlap. `reset()` mid-grab emits `grabEnd` so a hand-lost gap never strands a
held widget.

**Tests.** None.

---

## 4. open-palm-halt — the kill-switch

**Trigger.** Flat open palm, four fingers out, shoved toward the camera and held
still. "Talk to the hand."

**Phases.** First open frame captures the relaxed baseline size → a push past
`pushRatio`× baseline anchors the dwell → held still for `holdMs` → fires →
latches until the palm closes. A relaxed open palm is the resting/aiming pose, so
it must never halt on its own; the push gate is what makes this deliberate.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `holdMs` | `1200` | Continuous still-pushed-open dwell before `halt` fires | `open-palm-halt-recognizer.ts:DEFAULT_OPEN_PALM_HALT` |
| `maxDriftNx` | `0.06` | Drift from the anchor that RE-ANCHORS the dwell clock (does not reject). A moving palm never fires | `open-palm-halt-recognizer.ts:DEFAULT_OPEN_PALM_HALT` |
| `pushRatio` | `1.28` | Palm size must exceed this × the relaxed baseline to arm the dwell | `open-palm-halt-recognizer.ts:DEFAULT_OPEN_PALM_HALT` |
| `haltHoldMs` | `1200` | gesture-core's mirror of `holdMs` (re-exported from the recognizer's default, not re-typed) | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `haltMaxDriftNx` | `0.06` | gesture-core's mirror of `maxDriftNx` | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `haltPushRatio` | `1.28` | gesture-core's mirror of `pushRatio` | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

**Effect.** A targetless `halt` intent, once per hold. Passes through the hub
unchanged to the kill-switch.

**Scope.** **GLOBAL** — HUD-wide, bypasses hover entirely. Irreversible: there is
no undo for a halt.

**Arbitration.** Requires `pose === "open" && extendedCount === 4 && !pinchActive`.
Any non-open frame fully resets (a flicker restarts from zero). Nothing starves
it and it starves nothing — which is why the push + dwell + stillness gates carry
the whole burden of not firing by accident.

**Known conflict (#3).** Halting over a widget also emits a no-op resize
lifecycle — see the arbitration map.

**Tests.** `open-palm-halt-recognizer.test.ts` (13).

---

## 5. pinch-bloom — quick-pinch tap (PRIMARY click)

**Trigger.** A quick pinch that springs back open. Pinch and let go.

**Phases.** Rising edge times the pinch → falling edge under `holdMs` is a tap
candidate → fires as soon as the hand reads open, allowing `bloomWindowMs` for
the pose debounce to catch up → latches until the next engage.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `holdMs` | `350` | Max engagement for a release to be a tap, not a grab. gesture-core passes `grabHoldMs`, the same number pinch-hold gets | `pinch-bloom-recognizer.ts:DEFAULT_PINCH_BLOOM` |
| `bloomWindowMs` | `150` | Grace after release for the open pose to arrive (pose debounce lag) | `pinch-bloom-recognizer.ts:DEFAULT_PINCH_BLOOM` |
| `bloomWindowMs` | `150` | gesture-core's mirror of the above; this is the value actually passed | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

**Effect.** A targetless `tap`, which the hub upgrades from the pinned hover →
synthesized pointerdown/up/click.

**Scope.** HUD-wide → widget via hover. The cursor is frozen at pinch-engage (and
re-anchored to the pre-pinch aim), so hover stays pinned to pinch-start: a bloom
off any card yields a targetless tap the hub drops, so "pinch off a card =
navigation only" falls out for free.

**Arbitration.** Mutually exclusive with pinch-hold via the shared `grabHoldMs`.
Emits the SAME bare `tap` as palm-click — nothing downstream can tell the two
apart (see the arbitration map, ambiguity #4).

**Tests.** `pinch-bloom-recognizer.test.ts` (6).

---

## 6. open-hand-resize — grow / shrink a widget

**Trigger.** Hold an open hand over a widget for a beat, then open or close it
further. The widget follows.

**Phases.** ARM (candidate held `armMs` continuously; captures the openness
BASELINE, emits `resizeStart` + `resizeMove{scale: 1}`) → APPLY (`resizeMove`
per frame, rate-limited) → DISARM (`resizeEnd`, only if a start actually fired).

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `armMs` | `220` | Candidate dwell before resize arms. The main anti-twitch guard: a hand that flashes open for a frame never arms | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `deadband` | `0.12` | \|openness − baseline\| below this emits scale 1.0, so a steady hand never drifts the widget | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `gain` | `0.9` | Multiplier on the past-deadband openness delta | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `minScale` | `0.4` | Lower clamp on the emitted scale | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `maxScale` | `2.5` | Upper clamp — one gesture can't fling a widget past a sane range | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `maxScaleStepPerMs` | `0.01` | Rate limit, so the applied size eases rather than snaps | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |
| `emitEpsilon` | `0.003` | Skip emitting below this change (frame-rate quiet) | `open-hand-resize-recognizer.ts:DEFAULT_OPEN_HAND_RESIZE` |

**Effect.** `resizeStart` / `resizeMove{scale}` (CUMULATIVE from the baseline, not
incremental) / `resizeEnd`.

**Scope.** widget via hover.

**Arbitration.** `resizeEngageAllowed` (gesture-core) requires open pose, not
pinching, no palm-click candidate in flight, and openness at/above the closed
band. It reads palm-click's state from the PREVIOUS frame (resize is pushed
before palmClick), which is fine for a multi-frame candidate.

**Known conflict (#1) — this is the live one.** Four-finger-scroll and resize can
be armed and emitting simultaneously, on the same widget, from the same curl. See
the arbitration map.

**Tests.** `open-hand-resize-recognizer.test.ts` (9).

---

## 7. index-scroll — fingertip scroll (demoted)

**Trigger.** Point at a surface and flick your fingertip up or down.

**Phases.** Rising edge anchors the fingertip ny and emits `scrollStart` → each
sample past the velocity deadband emits an INCREMENTAL `scrollMove{dy}` →
`scrollEnd` on the falling edge.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `minVelocity` | `0.35` | Min \|velocity\| (ny-units/sec) to scroll. The aiming deadband: a slow, aiming point steers the cursor without scrolling | `index-scroll-recognizer.ts:DEFAULT_INDEX_SCROLL` |
| `pixelsPerUnit` | `1400` | ny delta → wheel px | `index-scroll-recognizer.ts:DEFAULT_INDEX_SCROLL` |
| `maxStepPx` | `90` | Per-frame \|dy\| clamp so a landmark pop can't lurch the page | `index-scroll-recognizer.ts:DEFAULT_INDEX_SCROLL` |

**Effect.** `scrollStart` / `scrollMove{dy}` / `scrollEnd`.

**Scope.** widget/surface via hover.

**Arbitration.** `pose === "point" && !pinchActive`. The point pose ALSO steers
the cursor, which is the whole reason for the velocity deadband. Demoted behind
fist-scroll but fully live: it shares a pose with nothing else, so it never
contends.

**Tests.** `index-scroll-recognizer.test.ts` (8).

---

## 8. fist-scroll — fist-drag scroll (PRIMARY scroll)

**Trigger.** Make a fist and drag it up or down.

**Phases.** Rising edge anchors the fist origin (`mode = "idle"`) → the first axis
past `activateDist` WINS and latches for the whole fist → vertical-dominant
claims `scroll` (emits `scrollStart`, then incremental `scrollMove{dy}`);
lateral-dominant latches `swipe` and never scrolls → `scrollEnd` on release.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `activateDist` | `0.05` | Net translation from the fist origin before an axis claims the fist. Below it the fist is "stationary" (palm-click / collapse own it) | `fist-scroll-recognizer.ts:DEFAULT_FIST_SCROLL` |
| `verticalDominance` | `1.2` | \|dy\| must beat \|dx\| by this factor at activation, else the fist goes to swipe | `fist-scroll-recognizer.ts:DEFAULT_FIST_SCROLL` |
| `pixelsPerUnit` | `1600` | Vertical translation → wheel px | `fist-scroll-recognizer.ts:DEFAULT_FIST_SCROLL` |
| `maxStepPx` | `90` | Per-frame \|dy\| clamp | `fist-scroll-recognizer.ts:DEFAULT_FIST_SCROLL` |

**Effect.** `scrollStart` / `scrollMove{dy}` / `scrollEnd`. Dragging the fist DOWN
scrolls content DOWN.

**Scope.** widget/webview via hover.

**Arbitration.** **This recognizer is the fist's arbiter.** It exposes `mode`
(`idle` / `scroll` / `swipe`), and `fistScrolling = mode === "scroll"` starves
swipe, collapse, and palm-click. Latching (not per-frame re-classification) is
what stops a scroll flickering into a swipe mid-drag.

**Known asymmetry (#2).** `fistScrolling` is `mode === "scroll"` ONLY, so a
`swipe`-latched fist starves nothing. See the arbitration map.

**Tests.** `fist-scroll-recognizer.test.ts` (7).

---

## 9. four-finger-scroll — beckon scroll

**Trigger.** Palm to the camera, curl and uncurl your four fingers together, like
beckoning. Curl scrolls down, uncurl scrolls up.

**Phases.** The curl gate (`createScrollCurlGate`) makes the hand a CANDIDATE only
while actively curling (openness below `scrollArmOpennessCeil` but at/above
`palmClickOpennessThreshold`), then requires `scrollCurlSustainMs` of that
candidate before engaging → rising edge anchors openness + emits `scrollStart` →
samples past `minVelocity` emit `scrollMove{dy}` → `scrollEnd`.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `minVelocity` | `0.9` | Min \|openness velocity\| (units/sec) to scroll; a steady palm never drifts | `four-finger-scroll-recognizer.ts:DEFAULT_FOUR_FINGER_SCROLL` |
| `pixelsPerUnit` | `900` | Openness delta → wheel px | `four-finger-scroll-recognizer.ts:DEFAULT_FOUR_FINGER_SCROLL` |
| `maxStepPx` | `90` | Per-frame \|dy\| clamp | `four-finger-scroll-recognizer.ts:DEFAULT_FOUR_FINGER_SCROLL` |
| `scrollCurlSustainMs` | `250` | Sustained curl before scroll may engage. This is what stops a palm-click's fast close leaking a scroll delta | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `scrollArmOpennessCeil` | `1.6` | UPPER edge of the candidate band: a held-open hand is not a candidate | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

The candidate band is `[palmClickOpennessThreshold, scrollArmOpennessCeil)` =
`[1.35, 1.6)`.

**Effect.** `scrollStart` / `scrollMove{dy}` / `scrollEnd`.

**Scope.** widget via hover.

**Arbitration.** Cleanly separated from **palm-click** by construction: the bands
are disjoint (a click drives openness below 1.35, which aborts the candidate) and
a click's ~600ms round trip is far shorter than the 250ms sustain plus the travel,
so a close-open click yields ZERO scroll deltas. This is a fix for a conflict that
already bit once, and it is the model the others should follow.

**Known conflict (#1).** It is NOT separated from **open-hand-resize**, which
shares the same openness scalar. See the arbitration map.

**Tests.** `four-finger-scroll-recognizer.test.ts` (8), plus the gate in
`hand/gesture-click-gates.test.ts`.

---

## 10. palm-click — close-then-open (SECONDARY click)

**Trigger.** Close your hand into a fist and open it again, quickly.

**Phases.** IDLE → (a close, if the cursor is slow enough and we are past the
refractory) CLOSING, freezing the aim at the pre-curl point → reopen within
`reopenWindowMs` FIRES `tap` at the frozen point → or held past `cancelMs`,
CANCEL without firing.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `reopenWindowMs` | `600` | Window after close-START in which a reopen fires the click | `palm-click-recognizer.ts:DEFAULT_PALM_CLICK` |
| `cancelMs` | `700` | A fist held this long is not a click. Deliberately LONGER than collapse's `holdMs` (500), which is why `collapseFired` must gate this gesture | `palm-click-recognizer.ts:DEFAULT_PALM_CLICK` |
| `maxEnterSpeed` | `1.6` | Max cursor speed (units/sec) at which a close may START — kills the flick-into-a-curl mis-click. NOT surfaced in `HandGestureConfig` | `palm-click-recognizer.ts:DEFAULT_PALM_CLICK` |
| `refractoryMs` | `250` | Lockout after a fired tap; debounces a curl-bounce into one tap. NOT surfaced in `HandGestureConfig` | `palm-click-recognizer.ts:DEFAULT_PALM_CLICK` |
| `palmClickOpennessThreshold` | `1.35` | Openness below which a frame counts as "closed", ON TOP OF all four fingers reading curled. Matches `curlThreshold` | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `palmClickReopenWindowMs` | `600` | gesture-core's mirror of `reopenWindowMs` | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `palmClickCancelMs` | `700` | gesture-core's mirror of `cancelMs` | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `palmClickAimLeadMs` | `140` | How far back the pre-curl aim is recovered from the cursor history. Larger than the pinch lead: a full-hand curl drifts the fingertip more than a two-finger pinch | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

**Effect.** A targetless `tap` — identical to pinch-bloom's.

**Scope.** HUD-wide → widget via hover.

**Arbitration.** `engaged` drops on `pinchActive`, on `collapseFired` (a fist that
already collapsed must not also click on release), and on `fistScrolling`. `closed`
requires BOTH `pose === "fist"` AND the openness scalar below its threshold —
belt-and-suspenders, so a partial curl never reads as a click.

**Known asymmetry (#2).** Palm-click is NOT gated on `swipeFired`, though collapse
is. See the arbitration map.

**Tests.** `palm-click-recognizer.test.ts` (17).

---

## 11. thumb-confirm — 👍 / 👎

**Trigger.** A sustained thumbs-up approves a pending send; thumbs-down cancels.

**Phases.** Per-frame classification (`computeThumbGesture`) → a matching gesture
held `holdMs` continuously fires once and latches → any change of gesture
(up→down, or → neither) re-anchors the clock, so you can't ride an up-hold into
an accidental cancel.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `holdMs` | `400` | Continuous dwell before a thumb fires. The anti-passing-hand guard | `thumb-confirm-recognizer.ts:DEFAULT_THUMB_CONFIRM` |
| `minThumbExtension` | `1.15` | Thumb-tip↔wrist / palm must exceed this — the thumb is clearly cocked out | `hand/gesture-core.ts:DEFAULT_THUMB_GESTURE` |
| `maxFingerRatio` | `1.35` | EVERY non-thumb finger's tip/palm ratio must be below this (all curled) | `hand/gesture-core.ts:DEFAULT_THUMB_GESTURE` |
| `minThumbVertical` | `0.35` | \|thumb vertical\| must exceed this, so a sideways thumb is neither up nor down. Its SIGN picks up vs down | `hand/gesture-core.ts:DEFAULT_THUMB_GESTURE` |

**Effect.** Targetless `confirmApprove` / `confirmCancel`. The confirm gate, not
the hub, decides whether a pending send exists to answer.

**Scope.** HUD-wide → the send gate.

**Arbitration.** Fed independent of `pose` (a thumb reads as a fist by count), but
gated OFF while pinching. The ~400ms dwell is the only thing between a passing
hand and a sent message.

**Tests.** `thumb-confirm-recognizer.test.ts` (8), plus the geometry in
`hand/gesture-thumb.test.ts`.

---

## 12. swipe — navigation

**Trigger.** Make a fist and move it sideways. (Mouse driver: Shift+drag.)

**Phases.** Rising edge of `engaged` anchors the origin → each sample is measured
against it → clearing `minDx` within `maxMs`, not too vertical, fires once and
latches until disengage. Window expiry RE-ANCHORS rather than rejecting, so a
slow-then-fast drag still registers from a fresh origin.

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `minDx` | `0.18` | Minimum normalized horizontal displacement to count as a swipe | `swipe-recognizer.ts:DEFAULT_SWIPE` |
| `maxMs` | `450` | Window from the origin. On expiry the origin RE-ANCHORS to the current sample | `swipe-recognizer.ts:DEFAULT_SWIPE` |
| `maxDyRatio` | `0.6` | Reject swipes whose \|dy\| exceeds \|dx\| × this (too vertical) | `swipe-recognizer.ts:DEFAULT_SWIPE` |

**Effect.** `swipeLeft` / `swipeRight` → navigation.

**Scope.** **GLOBAL** — HUD-wide. Irreversible in the sense that it moves you off
the current view; nothing about the gesture is undone by releasing.

**Arbitration.** `engaged = pose === "fist" && !fistScrolling`. Starved by
fist-scroll's `scroll` mode. Fires `swipeFired`, which gates collapse — but NOT
palm-click (#2). Shared with the mouse driver, so thresholds stay consistent
across input sources.

**Tests.** `swipe-recognizer.test.ts` (11).

---

## 13. collapse — stow

**Trigger.** Make a fist and hold it still.

**Phases.** Fist rising edge anchors `fistStart` → at `holdMs`, with no swipe and
no scroll latched, fires once (`collapseFired`).

**Thresholds.**

| Constant | Value | Gates | Source |
|---|---|---|---|
| `holdMs` | `500` | Stationary-fist dwell before collapse fires | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

**Effect.** A `collapse` intent.

**Scope.** HUD-wide. Implemented inline in `gesture-core.ts`, not as its own
recognizer module.

**Arbitration.** Requires `pose === "fist" && fistStart !== null && !swipeFired &&
!collapseFired && !fistScrolling`. The most heavily gated gesture in the set —
and the reference for what palm-click's gating is missing (#2). `collapseFired`
in turn gates palm-click, so one fist can't both collapse and click; that works
because palm-click's `cancelMs` (700) outlasts this `holdMs` (500).

**Tests.** Partial — the gates in `hand/gesture-click-gates.test.ts`.

---

## 14. Shared classification (not a gesture)

The pose/pinch machinery every gesture above reads. Retuning anything here moves
several gestures at once.

| Constant | Value | Gates | Source |
|---|---|---|---|
| `inset` | `0.15` | Interaction-box inset, so the user needn't reach the frame edges | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `extendThreshold` | `1.6` | Finger reads extended above this tip/palm ratio | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `curlThreshold` | `1.35` | Finger reads curled below this (hysteresis band between the two) | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `debounceFrames` | `3` | Agreeing frames before a pose flip commits | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `fistMaxExtended` | `1` | extendedCount at/below this ⇒ fist candidate | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `openMinExtended` | `3` | extendedCount at/above this ⇒ open candidate | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `lostGraceMs` | `250` | Continuous hand-lost ms before the cursor goes inactive (and transient state resets) | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchOnRatio` | `0.4` | Pinch ENGAGES below this thumb-index/palm ratio | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchOffRatio` | `0.55` | Pinch RELEASES above this (hysteresis) | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchReleaseGraceMs` | `150` | Sustained un-pinch before a release commits. Absorbs a landmark pop during a fast drag; engage stays frame-debounced, only release is time-graced | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchMinNonPinchFingerRatio` | `1.35` | At least one of middle/ring/pinky must stay at/above this for a frame to be a pinch candidate — the closing-fist guard | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchLostGraceMs` | `200` | Hand-lost gap a held pinch survives without re-anchoring. Kept ≤ `lostGraceMs` so the cursor never de-activates first | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `pinchAnchorLeadMs` | `110` | How far back the pre-pinch aim is recovered on engage (the Vision-Pro aim-before-onset pattern) | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |
| `cursorHistoryMs` | `220` | Ring-buffer retention for the cursor history both aim leads read | `hand/gesture-core.ts:DEFAULT_HAND_GESTURE` |

**Note on `pinchMinNonPinchFingerRatio` (#5).** It is `1.35`, exactly
`curlThreshold`. The pinch-shape guard's decision boundary sits precisely on the
per-finger hysteresis boundary — zero margin. It works (hysteresis + the 3-frame
debounce absorb it), but the two numbers being equal is coincidence, not design.

---

## Arbitration map

**The cascade.** Who starves whom, in the order it resolves:

1. **Pose is the top-level split.** open/point, pinch, and fist are mutually
   exclusive. Most "conflicts" can't happen because the poses can't coexist.
2. **`pinchActive` starves nearly everything.** It gates off palm-click,
   four-finger-scroll, thumb-confirm, resize, index-scroll, fist-scroll, and
   halt; and it clears the fist anchors outright. Swipe/collapse/cursor are
   skipped by an early return.
3. **`fistScroll.mode` arbitrates the fist.** The first axis past `activateDist`
   wins and latches. `mode === "scroll"` starves swipe, collapse, and palm-click.
4. **`grabHoldMs` splits tap from grab.** One shared number, exact exclusion.
5. **`collapseFired` gates palm-click**, so one fist can't both collapse and click.
6. **`swipeFired` gates collapse** — but not palm-click.
7. **Hover gates the widget-scoped lifecycles.** The hub drops a targetless
   `grabStart` / `resizeStart` / `scrollStart` and its whole lifecycle over empty
   space. "Only over a widget" falls out of one mechanism, not four.

**What is global.** `halt` and `swipe` bypass hover entirely and are the two
irreversible gestures in the set. Everything else is either hover-scoped or
reversible.

### Known conflicts

**#1 — four-finger-scroll ∧ open-hand-resize. NOT mutually exclusive. Live.**
Both ride the same smoothed openness scalar, both want an open pose over a widget.
`resizeEngageAllowed` disarms resize once openness enters the closed band
(< `palmClickOpennessThreshold` = 1.35), but the four-finger scroll band is
`[1.35, 1.6)` — entirely ABOVE that floor. So: hold an open palm over a widget for
`armMs` (220ms; resize arms, baseline captured) → curl to scroll → after
`scrollCurlSustainMs` (250ms) scroll arms and emits `scrollMove`, while the same
curl has already carried openness past resize's `deadband` (0.12) and resize emits
`resizeMove`, shrinking the widget. **Both fire, from one motion, on one target.**

The code comment used to claim the two "separate by dynamics" (scroll's velocity
deadband vs resize's arm dwell). Nothing enforces that: the dwell completes while
the hand is still held open, BEFORE the curl starts, so the guard it describes
never runs. Likelihood: high — any deliberate scroll after a pause.

**Deliberately not fixed.** The defect is real; the fix is a feel call (hard
interlock, raise resize's floor above the scroll band, or accept the overlap).
Which gesture should win a curl over a widget is Filippo's decision, not a
silent retune.

**#2 — palm-click stays armed through a swipe-latched fist. Asymmetric gate.**
`fistScrolling` is `mode === "scroll"` only, so a `swipe`-latched fist starves
nothing. Collapse IS gated on `swipeFired`; palm-click is NOT. So a lateral fist
drag fires `swipeLeft`, and opening the hand within `reopenWindowMs` (600ms) then
fires `tap` on whatever the reticle now sits over — post-navigation. The asymmetry
has no stated reason. Open question: bug, or a wanted chord?

**#3 — halt over a widget emits a no-op resize lifecycle.**
Halt needs an open pose held 1200ms; resize arms on an open pose over a widget in
220ms. Palm *size* changes during the shove, but openness is palm-normalized, so
resize sits in its deadband and emits `resizeStart` + `resizeMove{scale: 1}` +
`resizeEnd`. No geometry changes, but it dispatches `studio:gesture-interaction`
and paints the accent outline. Certain whenever halt is used over a widget.
Cosmetic.

**#4 — two gestures, one indistinguishable intent.**
pinch-bloom and palm-click both emit a bare `{type: "tap"}`. Not a misfire, an
ambiguity: nothing downstream (or in a log) can tell which gesture produced a
click — which is also what makes #2 hard to debug.

**#5 — pinch vs fist share a threshold boundary.** See §14.

### Well-solved, for reference

- **tap vs grab** — one shared `grabHoldMs`, exact exclusion, no race.
- **palm-click vs four-finger-scroll** — disjoint openness bands PLUS the 250ms
  sustain gate. This is the fix for a conflict that already bit once, and the
  pattern #1 wants.
- **collapse then click** — `cancelMs` (700) > collapse `holdMs` (500), so
  `collapseFired` reliably suppresses the click on the same fist.

---

## Shared-signal index

Which recognizers ride which signal. **Two gestures on one signal is where
conflicts come from** — #1 is visible on sight in the openness row.

| Signal | Computed by | Smoothing | Read by |
|---|---|---|---|
| **openness** (mean tip/palm ratio) | `computeHandOpenness` | one-euro `{0.6, 0.008, 1.0}` — deliberately heavier than the cursor, so resize is calm | **open-hand-resize** (delta from baseline), **four-finger-scroll** (velocity), **palm-click** (`closed` test), the **scroll-curl gate** ⚠️ **#1 lives here** |
| **palm centroid** | `computePalmCentroid(Normalized)` | one-euro `{1.0, 0.02, 1.0}` (smoothed for pinch-drag/hold; **raw** for fist-scroll + swipe, so the two agree on the fist's motion) | **pinch-drag** (pan), **pinch-hold** (grabMove), **halt** (drift gate), **fist-scroll** (arbitration), **swipe** |
| **palm size** (wrist↔middle-MCP) | `computePalmSizeRaw` | one-euro `{1.0, 0.02, 1.0}` | **pinch-dolly** (dolly, ratio to engage baseline), **halt** (push gate, ratio to relaxed baseline) — disjoint: they never run in the same pose |
| **index fingertip** | `computeCursorTarget` | one-euro `{1.0, 0.02, 1.0}` | **cursor steering**, **index-scroll**. Frozen while fist/pinch — which is exactly why palm-click and pinch-bloom are safe to click with, and why the retired index-jab was not |
| **thumb-index ratio** | `computePinchRatio` | none (raw, hysteresis + debounce instead) | the **pinch latch** → pinch-drag / -hold / -dolly / -bloom |
| **per-finger ratios** | `computeFingerRatios` | none (per-finger hysteresis) | **pose classification**, **`computePinchShapeValid`** (fist guard), **`computeThumbGesture`** |
| **cursor speed** | EMA of filtered cursor deltas | EMA (0.6 / 0.4) | **palm-click** flick guard only |
| **cursor history** | `createCursorHistory` | ring buffer, `cursorHistoryMs` retention | **pinch-bloom** + grab (`pinchAnchorLeadMs`), **palm-click** (`palmClickAimLeadMs`) |

**Also palm-normalized, so depth-invariant:** every ratio above divides by
wrist↔middle-MCP. That is why halt has to use raw palm SIZE for its push gate —
openness cannot see a hand moving toward the camera.

---

## Hover priority ladder

The hub sorts providers descending and takes the first non-null resolve, so ties
resolve by sort stability. Register through `HOVER_PRIORITY` (`types.ts`), never a
bare literal.

| Rung | Value | Provider |
|---|---|---|
| `raycast` | 20 | 3D scene raycast. Reserved; nothing registers here yet |
| `domHitTest` | 10 | `pointer-synth.ts` — live DOM hit-test under the reticle |
| `domRects` | 0 | `hub.ts` built-in stage-rect registry; the fallback floor |

---

## Test coverage

| Gesture | Tests |
|---|---|
| pinch-dolly | 16 |
| pinch-drag | none (no thresholds of its own) |
| pinch-hold | none |
| open-palm-halt | 13 |
| pinch-bloom | 6 |
| open-hand-resize | 9 |
| index-scroll | 8 |
| fist-scroll | 7 |
| four-finger-scroll | 8 (+ the curl gate) |
| palm-click | 17 |
| thumb-confirm | 8 (+ geometry) |
| swipe | 11 |
| collapse | partial (gates only) |

**Discoverability is the biggest open gap.** Roughly twelve gestures ship and two
are ever named on screen: the HUD toggle, and `ConfirmGesturePanel` teaching 👍/👎
reactively while a send is pending. There is no legend, hint overlay, first-run
tutorial, or tooltip naming any gesture anywhere in `apps/desktop/src`.
`debug-cursor.tsx` flashes intent type names but is dev-only (`?studioDebug=1`)
and `aria-hidden`. That there is no affordance is a defect; what to build is a
product decision, not a code fix.
