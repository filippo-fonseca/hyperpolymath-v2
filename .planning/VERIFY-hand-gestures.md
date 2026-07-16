# VERIFY — U2 `hand-gestures` (branch `l3/hand-gestures`)

Continuation of unit U2 after a prior executor died mid-run. Base commit
`f7499a60` had already landed the openness signal + the two continuous-gesture
RECOGNIZERS (pure state machines) and their hub upgrade path. This pass finished
the WIRING, drawer operability, the native-webview scroll IPC, a reliability fix,
and the recognizer unit tests.

## Commits (newest first)

| SHA | Summary |
|-----|---------|
| `36502f77` | test(desktop): unit-test the resize state machine + scroll pose recognizers |
| `babe37fd` | fix(desktop): reset continuous-gesture state promptly on hand-loss |
| `97f574b8` | feat(desktop): make the drawer operable by the hand cursor |
| `d616b048` | feat(desktop): wire open-hand resize + index-scroll into pointer-synth |
| `0448a94f` | feat(desktop): studio_webview_scroll IPC for promoted child webviews |
| `3f1b22f5` | test(desktop): unit-test computeHandOpenness (already-present test, committed) |

Pre-existing base: `f7499a60` (recognizers + hub + types + gesture-core openness).

## What landed this pass

1. **Open-hand resize wiring** (`pointer-synth.ts`): `resizeStart{targetId}`
   captures the widget's arm-time `w0/h0` from the store and lights an accent-ring
   affordance on the frame; `resizeMove{scale}` calls the existing
   `resizeWidget(id, w0*scale, h0*scale)` (store `clampToStage` floors at 0.16);
   `resizeEnd` clears the ring. Gated OFF while a grab-drag is active. Arm dwell
   (300ms), deadband, hysteresis + rate-limit all live in the recognizer
   (`open-hand-resize-recognizer.ts`, base commit); disarm on pinch / hover-loss /
   hand-loss is driven by the recognizer's `engaged` edges + `reset()`.
2. **Drawer operability** (`Drawer.tsx`, `pointer-synth.ts`): collapsed toggle
   enlarged to 40px + padding and the collapsed drawer widened to 184px (was a
   ~27px choke point); a drawer targeting glow rings the drawer in accent while
   the reticle hovers it (driven off the hub's resolved hover, applied
   imperatively — zero re-renders). `elementFromPoint` already respects the
   drawer's z40 stacking, so open → hover a catalog entry → expand-click summons.
3. **Index-finger scroll dispatch** (`pointer-synth.ts` + Rust + `native-webview.ts`
   + `BrowserWidget.tsx`): `scrollStart` resolves the surface once — a live
   promoted browser (tagged `data-native-webview-active`) routes to the new
   `studio_webview_scroll(label, dx, dy)` IPC (Rust `webview.eval("window.scrollBy…")`,
   registered in `lib.rs`), every other DOM surface takes a synthesized
   `WheelEvent` at the cursor. `scrollMove{dy}` streams the per-frame delta.
4. **Reliability** (`gesture-core.ts`): on a true hand-loss (past `lostGraceMs`),
   `resetTransient()` now runs immediately so `resizeEnd`/`scrollEnd`/`grabEnd`
   fire promptly instead of lazily on reacquire — no more stranded half-applied
   widget. The loss window (250ms) is longer than the pinch soft-reacquire window
   (`pinchLostGraceMs` 200ms), so pinch-drag soft-reacquire across brief dropouts
   is unaffected. Both new recognizers were already in `resetTransient` (base).
5. **Tests**: 18 new pure unit tests (resize arm/apply/disarm/clamp/reset,
   scroll engage/deadband/sign/clamp/reset) in the gesture-core node-env idiom.

## Verification (run in `apps/desktop`)

| Check | Command | Exit |
|-------|---------|------|
| Typecheck | `pnpm typecheck` | **0** |
| Unit tests | `pnpm vitest run` | **0** — 10 files, **52 tests** pass (was 34; +18) |
| Web build | `npx vite build` | **0** (pre-existing chunk-size / dynamic-import warnings only) |
| Rust check | `cargo check` (in `src-tauri`) | **0** — `studio_webview_scroll` compiles on Tauri 2 |

Note: the package `build` script is `tauri build` (full native bundle); per the
seed we did NOT run `cargo build`. `cargo check` WAS run (a Rust change was
unavoidable for the child-webview scroll path) and passed. A full `tauri build`
should be run at integration time.

## Manual smoke checklist (requires a camera — cannot run headless here)

Enable hand tracking with ⌘⇧H, then:

1. **Pinch-drag unchanged**: pinch over a widget header and move — the widget
   drags exactly as before; pinch over empty space still pans the camera.
2. **Resize arm + affordance**: hold an OPEN hand over a widget ~300ms — an accent
   ring appears on that widget's frame (armed). No ring appears over empty space.
3. **Resize apply**: with the ring lit, open the hand wider → the widget grows;
   close it toward/past the arm baseline → it shrinks. Holding steady must NOT
   drift the size (deadband). Motion should ease, never snap or twitch.
4. **Resize disarm**: pinch, or move the hand off the widget, or drop the hand —
   the ring clears and the size stops changing (resizeEnd). No stranded size after
   a hand-loss.
5. **Resize floor**: shrink hard — the widget stops at the 0.16 clamp floor.
6. **Drawer open by hand**: with the drawer collapsed, move the reticle over it —
   it should glow (targeting). Expand-gesture (quick pinch-release) over the
   toggle opens the catalog.
7. **Drawer summon**: with the drawer open, hover a catalog tile (glow), expand to
   summon it onto the stage.
8. **DOM scroll**: point (index only, others curled) over a scrollable DOM widget
   (News / WhatsApp) and flick the fingertip up/down — content scrolls; a slow
   steady point aims the cursor WITHOUT scrolling (velocity deadband).
9. **Native browser scroll**: open a Browser widget on a frame-blocking site (so it
   promotes to a native child webview), point over it, flick up/down — the page
   scrolls via the `studio_webview_scroll` IPC. (This path only exercises after a
   real `tauri build`; the web build stubs Tauri `invoke`.)
10. **No scroll/resize fight**: pointing to aim the cursor and open-hand to resize
    must not cross-trigger; both are gated OFF while pinching.
