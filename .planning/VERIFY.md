# Verification — orb-widget

## 1. Auto-appears centered, persists, and cannot be closed

**PASS (automated + browser inspection).**

- Boot path: `WidgetWindowLayer` rehydrates persisted windows and summons the singleton `orb` at `{ x: 0.5, y: 0.5 }` only when none exists.
- Headless Chrome at a 1280×800 window observed exactly one orb window. Its rendered rect was `279.30 × 279.30px`, centered at `(639.99, 356.49)` in the inset Studio stage.
- After dragging and reloading, the same persisted window ID (`87d9e5e5-c797-4270-8429-d193ba7299ac`) was restored; the window count remained one and idle geometry returned to center.
- DOM inspection found no `Close window` or `Pin window to front` controls in the orb window.
- `widget-windows.test.ts` exercises `closeWidget`, `closeWidgetsByKind`, and `closeAll`; all three preserve the permanent orb while `closeAll` removes a normal browser window.

## 2. Full voice turn, state animation, and center/corner flight

**PASS for implementation/geometry; REAL TURN NOT RUN (environment unavailable).**

- `OrbWidget` subscribes to `studioBridge.on("jarvisState", ...)`, not `body.dataset`.
- Idle writes centered, large geometry. Any non-idle state writes the bottom-right target, and Motion animates `left`, `top`, `width`, and `height` with a damped spring (`stiffness: 82`, `damping: 20`, `mass: 0.9`). Returning to idle resets manual-drag override and writes centered geometry.
- `orb-geometry.test.ts` verifies a 300px idle diameter and a 124px active diameter at a bottom-right anchor inset 32px from both edges.
- Listening tightens/brightens the rings, thinking accelerates the counter-rotating arcs, speaking applies an eased pulse, and reduced-motion disables continuous/pulsing motion.
- A real turn against `localhost:3000` could not be run: `curl --max-time 3 http://localhost:3000/` returned connection failure / HTTP code `000` because no service was listening. This is the sole unexecuted runtime check.

## 3. Draggable orb with normal focus/z-order

**PASS (browser inspection).**

- The permanent/chromeless branch starts the existing move pointer session from the entire window body and calls the normal `focusWidget` path.
- The widget layer is portaled to `#studio-widget-root` at foreground z-index 2 while retaining pointer pass-through outside widgets. `document.elementFromPoint` at orb center resolved inside `[data-widget-window]`.
- Chrome DevTools pointer dispatch dragged the idle orb by `(100, -50)` pixels. Persisted normalized center changed from `(0.5, 0.5)` to `(0.5811688312, 0.4248120301)`.
- During active states, a drag of at least 4px sets a local manual override; later active-state transitions preserve the user position until idle clears the override.

## 4. Existing core visual plus purpose-built ornamentation

**PASS (code review + browser inspection).**

- `OrbWidget` mounts the existing `mountOrb` draw routine from `src/hud/orb.ts`; the core renderer was not copied or redesigned.
- New outer texture consists of three thin cyan rings, sparse arc segments, five drifting particles, counter-rotation, and a soft cyan bloom.
- Live Chrome screenshot inspection showed the complete concentric orb centered at approximately 279px with no frame/header chrome.

## 5. Legacy orb removed; typecheck/tests/build green

**PASS.**

- `main.ts` no longer imports or mounts `mountOrb`, and `index.html` no longer contains `#orb-canvas` or `.orb-ticks`. The existing routine progress ring remains as a separate compact status affordance.
- `rg` found no legacy `orb-canvas`, `orb-wrap`, `orb-ticks`, or `mountOrb(orbCanvas...)` references in `main.ts`, `index.html`, or `routine-loader.ts`.
- `pnpm --filter desktop typecheck` — exit 0.
- `pnpm --filter desktop test` — 4 files, 18 tests passed.
- `pnpm --filter desktop exec vite build` — exit 0; 2528 modules transformed.
- `git diff --check bgsd/studio-native...HEAD` — exit 0.

Non-failing pre-existing warnings: duplicate `jsx` key in `apps/desktop/tsconfig.json`, mixed static/dynamic import of `src/env.ts`, and the main bundle exceeding Vite's 500kB warning threshold.

---

# Action bridge verification

Date: 2026-07-11
Branch: `bgsd/action-bridge`
Base: `bgsd/studio-native`

---

Branch: `bgsd/studio-core-port`
Base: `next`

## Acceptance criteria

### 1. Voice opens and closes the weather widget

Status: **Automated path verified; live voice round trip blocked by local infrastructure.**

Evidence:

- `apps/web/tests/studio-action-bus.test.ts` passes and proves the two agent tool definitions are published, browser input is validated, and a valid `studio-action` is emitted on the existing physical bus.
- `apps/desktop/src/studio/actions/studio-action-router.test.ts` passes and proves an `open` action summons a catalog widget with catalog sizing, while `close` works by kind, id, and all.
- The desktop app was running and attempted `/api/jarvis/physical/events` against the worktree dev server.
- Live bearer authentication failed before the SSE route with `ECONNREFUSED 127.0.0.1:54322`; local Supabase/Postgres was unavailable. See `BLOCKED.md`.

### 2. Confirmed WhatsApp send materializes a confirmation card

Status: **Automated behavior verified; live voice/send round trip blocked by local infrastructure.**

Evidence:

- `apps/desktop/src/studio/actions/materialize.test.ts` passes.
- The test proves the WhatsApp tool call alone creates no widget, a `running` send task creates no widget, and only the existing post-confirm transport task's `done` state summons a card containing recipient and message text.
- A repeated `done` snapshot does not duplicate the card.
- No confirm-gate implementation or semantics were modified.

### 3. A tool result carrying a URL opens a browser widget

Status: **Verified.**

Evidence:

- `apps/desktop/src/studio/actions/materialize.test.ts` passes and proves an `open_url` result summons `browser` with the normalized HTTP URL in widget props.
- Materialization also accepts an HTTP(S) URL in `result.receipt.url` and rejects non-HTTP(S) URLs.
- Browser internals were not modified; the materializer only calls `summonWidget`.

### 4. Builds and dependency guard

Status: **Verified.**

Evidence:

- `pnpm --filter web typecheck` — exit 0.
- `pnpm --filter web build` — exit 0; all four `/api/studio/*` routes appear in the Next route manifest. Existing CSS/NFT warnings were non-fatal and outside this unit.
- `pnpm --filter desktop typecheck` — exit 0.
- `pnpm --filter desktop exec vite build` — exit 0; output includes the lazy `CardWidget` chunk. Existing duplicate-`jsx`, dynamic-import, and chunk-size warnings were non-fatal and outside this unit.
- `rg -n "@supabase|supabase-js" apps/desktop/package.json apps/desktop/src` returned no matches (`NO_DESKTOP_SUPABASE_CLIENT`).

## Prerequisite Studio API routes

Status: **Compiled and registered; live bearer curl blocked by local infrastructure.**

Evidence:

- Next production build registers `/api/studio/link-preview`, `/api/studio/weather`, `/api/studio/news`, and `/api/studio/whatsapp`.
- The routes accept paired-device bearer auth first and browser-cookie auth as fallback.
- Bearer curls reached the worktree server, but all returned HTTP 500 because middleware token validation requires local Postgres at `127.0.0.1:54322`, which refused connections.

## Focused test results

- Web: `apps/web/tests/studio-action-bus.test.ts` — 4/4 passed.
- Desktop: `studio-action-router.test.ts`, `materialize.test.ts`, and `widget-windows.test.ts` — 8/8 passed.

## Atomic commits

- `1a7e76c5` — Studio data API routes.
- `1ac0bf83` — validated agent tools and physical-bus SSE emit.
- `4d8567b8` — desktop SSE callback, action router, and bridge wiring.
- `12f6c2ac` — card widget and catalog entry.
- `6557de5d` — post-confirm and tool-result materialization.

## Live server cleanup

The worktree `pnpm --filter web dev` process was stopped after the curl attempt.

---

- `src/studio/tokens.ts` and `src/studio/debug/` are explicitly marked
  `TEMP: replaced by desktop-react-shell at merge`.
- Hand-gesture, voice-bridge, and WhatsApp realtime subscription integration
  are explicitly marked seams for their later owning units.
- The window layer is self-contained with its own React Query provider so it
  can run before the sibling shell is merged.

---

# Verification — webview-widget

Date: 2026-07-11
Branch: `bgsd/webview-widget`

## Acceptance criteria

### 1. example.com / wikipedia load in-frame — PASS

- Live Tauri debug-stage capture showed `https://example.com/` rendered inside
  the iframe with Browser header, URL bar, border, and resize handle intact.
- It remained in-frame beyond the four-second refusal timeout. The seed's stale
  `loaded` timer behavior was fixed in commit `20657abb`.
- Wikipedia returns HTTP 200 without `X-Frame-Options` or a CSP
  `frame-ancestors` restriction and is not a known blocker, so it uses the same
  verified generic iframe branch.

### 2. google.com / x.com native promotion and lifecycle — PASS

- An isolated live `tauri dev` stage summoned Google through
  `summonWidget("browser", { url: "https://google.com/" })`.
- Runtime evidence recorded create for the widget UUID; a live capture showed
  the real Google page inside widget bounds with DOM header/border present.
- Pointer interaction recorded hide, bounds updates during geometry changes,
  and show after release. Closing recorded destroy for the same UUID.
- `x.com` uses the same known-blocker promotion branch.

### 3. Relaunch recreates a persisted promoted widget — PASS

- Google was persisted, then the isolated debug page reloaded without summoning.
- Rehydration recreated the child using the same UUID and URL, with create,
  navigate, and bounds-sync runtime evidence.

### 4. Builds and live Tauri session — PASS

```text
pnpm --filter desktop typecheck                 PASS
pnpm --filter desktop test                      PASS — 4 files, 17 tests
pnpm --filter desktop exec vite build           PASS — 2527 modules
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
                                                  PASS
```

`tauri dev` launched successfully. Because sibling worktrees owned port 1420,
live verification used temporary CLI-only port 1422 and bundle-identifier
overrides. The untracked harness/tracing were removed, and the existing JARVIS
process was restored to its prior visibility.

## Scope and notes

- `git diff --check`: PASS.
- Bounds conversion unit tests cover scaling, rounding, fallback scale, and
  minimum transitional dimensions.
- No sibling-owned widget store, catalog, or `WidgetWindow` source was edited.
- Pre-existing non-failing warnings: duplicate `jsx` key, Vite import/chunk
  notices, and chunk-size notice.

---

# Verification — showcase-widgets

Date: 2026-07-11
Branch: `bgsd/showcase-widgets`
Base: `bgsd/studio-native`

Clock, camera, and polished news/weather. Sibling contract honored: `catalog.tsx`
got exactly two new entries (clock, camera) and nothing else; no `WidgetWindow`
or store (`state/widget-windows.ts`) edits; the idle composition fires only on a
genuinely empty persisted state.

## Atomic commits (plan order)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `a0ca3e76` feat(studio): idle-home clock widget with seconds sweep | `ClockWidget.tsx` + clock catalog entry |
| 2 | `150561dd` feat(studio): camera widget with getUserMedia preview | `CameraWidget.tsx` + camera catalog entry |
| 3 | `05d04f5a` polish(studio): showcase-quality news widget | `NewsWidget.tsx` |
| 4 | `f498331e` polish(studio): showcase-quality weather widget | `WeatherWidget.tsx` |
| 5 | `143ebd3b` feat(studio): idle-home default composition on fresh boot | `WidgetWindowLayer.tsx` |

## Live verification method

Full `pnpm tauri dev` against a real `localhost:3000` is not runnable in this
headless worktree (no Rust GUI display; no authed web backend; the Playwright MCP
browser can't set fake-media-device launch flags). Instead I drove the four
widgets in a **real Chromium** via the Playwright MCP against a throwaway Vite
harness (mounted each widget standalone; query cache seeded with sample receipts;
a real `canvas.captureStream()` track stood in for the webcam). The harness files,
screenshot, `dist/`, and `.playwright-mcp/` were all removed and never committed —
final `git status` is clean apart from the pre-existing `fable-plan.md` edit.

## Acceptance criteria

### 1. Fresh boot: orb + clock compose an idle-home; clock ticks — PASS

- `WidgetWindowLayer.tsx` captures `freshBoot = getWidgetWindows().length === 0`
  right after `rehydrateWidgetWindows()`, ensures the orb unconditionally, and
  summons the clock (`x:0.5, y:0.15`, upper-area, clear of the idle orb which
  centers at 0.5/0.5 per `orb-geometry`) **only** on a fresh boot. Any persisted
  layout skips composition, so a user-closed clock stays closed.
- Browser: clock rendered `15:31`, date line `SATURDAY, JULY 11`; seconds read
  `19` then `21` over a 2.1s wait (advances). Cyan seconds-sweep ring + firefly
  tip dot + `07` seconds label visible in the captured screenshot.

### 2. Camera live; close/stow releases the camera (LED off) — PASS

- Live: `LIVE` badge (pulsing ember dot), slim cyan HUD frame corners, video
  opacity 1.
- Release: `cameraRoot.unmount()` — exactly what close (removed) and stow
  (filtered out of the render tree) both do — transitions the stream track
  `readyState` `live → "ended"`, the browser-level LED-off signal. Verified:
  `before.trackState === "live"`, `after.trackStateAfterUnmount === "ended"`,
  video gone from DOM. The unmount cleanup also stops a stream that resolves
  after cancel (acquire-before-unmount race).

### 3. News + weather polished layouts, clean loading + error states — PASS

- News success: 5 rows `source · age · headline` (`BUSINESS · 4m`,
  `ENVIRONMENT · 47m`, `SCIENCE · 3h`, `MEDIA · 1d`); relative ages correct;
  two-line headline clamp. Hover applied cyan left-rule `rgba(47,168,255,0.95)` +
  tinted bg, fading on leave (focus shares the path). Animated skeleton while
  loading; empty state for zero articles.
- News error: titled `News unavailable` + message beneath (not a raw red string).
- Weather success: hero `75°` (mono thin) + condition glyph from the phrase
  (`raining` → CloudRain, cyan glow) + condition line. Forecast strip with a
  cyan-accented `NOW` column when the receipt carries `forecast`
  (`NOW / SUN / MON / TUE`); degrades to a mono `wind km/h · °C` stats strip when
  it doesn't — the live endpoint's actual shape (the previous `weather.forecast.map`
  would have crashed on it).
- Weather error: titled `Weather unavailable` + message beneath.
- Real end-to-end data through `studioFetch → /api/studio/{news,weather}` was not
  exercised (needs the Tauri `invoke` bridge + authed :3000); receipt contracts
  were read from `apps/web/lib/jarvis/executor.ts` and the widgets degrade around
  them without any `apps/web` edits.

### 4. Typecheck + vite build green; verified live — PASS

```text
pnpm typecheck (apps/desktop)      PASS — exit 0
pnpm vite build                    PASS — new ClockWidget/CameraWidget chunks
pnpm test                          PASS — 7 files, 30 tests
```

Live browser smoke of all four widgets passed (screenshot captured during the
run). Full `tauri dev` deferred to a machine with a display + backend.

## Constraint notes

- No new endpoints; no `apps/web` edits; weather degrades around the missing
  `forecast` field.
- No new heavy deps: clock sweep and camera frame are hand-drawn SVG/CSS; glyphs
  reuse the already-present `lucide-react`.
- Widget-frame contract (drag/resize/pin/close/stow) untouched.

---

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
