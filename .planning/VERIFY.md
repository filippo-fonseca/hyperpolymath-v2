# VERIFY — hand-cursor (bgsd/hand-cursor)

Port of the MediaPipe HandLandmarker gesture stack from `bgsd/studio-v2` into the
desktop Studio: opt-in webcam hand tracking, a brass reticle, pinch-to-grab
widget dragging, and pinch-to-press drawer/tile/button interaction — via DOM
pointer synthesis over the read-only widget DOM.

Verified live in Chromium (Playwright) against the standalone studio debug
harness (`src/studio/debug`, which mounts the real `WidgetWindowLayer`), plus
typecheck + vite build. Camera exercised with a permission-free canvas capture
stream so the full MediaPipe pipeline runs end-to-end.

## Acceptance criteria

### 1. Toggle on → reticle tracks the hand smoothly; toggle off releases the camera (LED off)
**PARTIAL / VERIFIED where automatable.**
- Toggle ON (HUD affordance + `Cmd/Ctrl+Shift+H`): within 500ms the driver
  registered, the MediaPipe model loaded **from the vendored `/models/mediapipe`
  assets** (console: `GL version: 3.0 … WebKit WebGL`, `Graph successfully started
  running`), `getUserMedia` was called once, and the status reached `running`
  (HUD label "Show your hand" — pipeline live, no hand on the blank fake frame).
- Toggle OFF: the camera track's `stop()` was invoked exactly once
  (`tracksStopped: 1` → stream released, camera LED off), status returned to idle
  (HUD label "Hand cursor", `aria-pressed=false`), and MediaPipe tore down cleanly
  (`Graph finished closing successfully`, `Successfully destroyed WebGL context`).
- Reticle mounts hidden by default (`data-reticle-visible=false`) and gates on
  `driver running && cursor.active`, so it appears only when a hand is tracked.
- **Not machine-verifiable here:** the *smoothness* of reticle tracking across the
  HUD with a real hand. That needs a physical hand in front of a real camera under
  `pnpm tauri dev` (a human). The tracking math is the byte-identical 1-euro +
  gesture-core port from `bgsd/studio-v2`, already unit-tested upstream, and the
  MediaPipe→driver→cursor pipeline is proven to run.

### 2. Pinch-drag moves a widget; pinch on a drawer tile summons; pinch on a stowed chip restores
**VERIFIED (DOM contract) / live-gesture flagged human-required.**
- The interaction reaches the widgets purely through synthesized DOM events at the
  reticle (widget store + `WidgetWindow` are never edited). The exact events
  `pointer-synth` emits drive the real handlers:
  - **Press path** (pinch-bloom → `expand` → `pointerdown`→`pointerup`→`click` at
    the reticle): dispatched on a drawer catalog tile → a Browser widget was
    summoned (window count 1 → 2), **no exception thrown** (the scoped
    `setPointerCapture` shim absorbed the synthetic-pointer capture failure).
    Stowed-chip restore is the same `onClick` path on the chip button.
  - **Drag path** (pinch-hold → `grabStart/Move/End` → `pointerdown`→cumulative
    `pointermove`→`pointerup` on the widget header): dragging a widget header moved
    the window by the **exact** cumulative delta (Δ 120×80 px), no exception.
- The hover provider hit-tests the live widget DOM (`elementFromPoint` →
  `closest([data-widget-window]/[data-widget-drawer])`), so the hub's grab/expand
  upgrades are gated to real targets and the reticle snaps on hittables.
- **Not machine-verifiable here:** producing the *pinch gesture itself* from a real
  hand (needs a camera + hand). The gesture→phase/intent recognizers are the
  byte-identical, upstream-tested port; only the desktop DOM-event tail is new, and
  that tail is verified above.

### 3. No tracking cost when off; typecheck + vite build green; `pnpm tauri dev` live
- **No cost when off:** VERIFIED. With the toggle off no driver is registered — no
  `getUserMedia`, no model, no rAF loop. On toggle-off the camera track is stopped
  and the WebGL context destroyed (console-confirmed). The window-hidden path
  unregisters the driver via `visibilitychange`.
- **typecheck:** VERIFIED green (`tsc --noEmit`, 0 errors).
- **vite build:** VERIFIED green (`built in ~2s`); MediaPipe correctly code-split
  into its own dynamically-imported `vision_bundle` chunk (136 kB); the vendored
  model + WASM copy into `dist/models/mediapipe/`.
- **`pnpm tauri dev` with the built-in camera:** NOT performed — this is a
  non-interactive session with no display/camera/human. Everything short of a
  physical hand is verified above; the macOS camera prompt plumbing
  (`NSCameraUsageDescription` + `com.apple.security.device.camera`) is in place so
  the prompt appears instead of a silent black feed.

## Port rules
- Destination `apps/desktop/src/studio/input` + `src/studio/cursor`, de-Next-ified
  (no `"use client"`, local imports, no MouseKeyboardDriver default — the desktop
  mouse is real). ✓
- MediaPipe WASM + `hand_landmarker.task` bundled locally under
  `public/models/mediapipe` (no CDN at runtime; confirmed the WASM/model loaded
  from `localhost/models/mediapipe/*`). `@mediapipe/tasks-vision@0.10.35` added to
  the desktop; `copy-mediapipe-wasm.mjs` re-vendors on upgrade. ✓
- Camera via `getUserMedia` in the webview; macOS permission plumbing added. ✓
- Opt-in: keyboard shortcut + HUD affordance, default OFF; reticle only while
  active. ✓
- v1 gestures via the ported gesture-core: open/point = cursor, pinch = grab/press
  through the driver→hub→pointer-synthesis pattern (no new event model). ✓
- Performance: landmarker runs per fresh video frame; suspended when off or window
  hidden. ✓
- Camera showcase widget (sibling): this unit calls `getUserMedia` independently;
  no shared stream manager built (seam noted). ✓

## Commit trail (atomic, explicit pathspecs)
1. `9ede83d` deps + vendored MediaPipe assets
2. `ec90d07` framework-free input core port
3. `12febfc` React bindings + hand-status store + brass reticle
4. `c45ab18` DOM pointer synthesis + hover provider
5. `64e4aa2` hand-tracking toggle/reticle mounted at widget seam
6. `e777443` macOS camera permission
7. `<this>` stage-rect fallback for bare hosts + VERIFY

## Scope honored
Owned the hand-input stack + reticle + toggle only. Did not edit the widget store,
other catalog entries, or `WidgetWindow` — widget windows are hit-tested and
dispatched into as a read-only DOM. MediaPipe assets bundled locally; no runtime
CDN fetches.
