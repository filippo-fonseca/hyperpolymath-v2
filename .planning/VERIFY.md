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
