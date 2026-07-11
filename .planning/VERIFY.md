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
