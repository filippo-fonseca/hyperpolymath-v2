# VERIFY — U6 `hud-aesthetic`

Branch `l3/aesthetic` off `bgsd/studio-native` tip `f21b6958`. Scope: apps/desktop only (no apps/web touched, no push).

## Commits (oldest → newest)

| SHA | Summary |
|-----|---------|
| `3e249af5` | Persisted HUD settings store (background + motion override) |
| `135fcbae` | Cheap canvas2d constellation ambient background |
| `558d9df2` | Surface-ladder tokens + mount constellation under grid scrim |
| `4194b68d` | Glass-depth widget chrome + hover lift + inset focus ring |
| `2dfa5043` | Drawer surface ladder + tile hover-lift, unified ease curve |
| `6509c75a` | Glass-register settings widget (hand cursor, background, motion, voice) |

## Verification (exit codes)

Run from `apps/desktop/`:

| Command | Exit | Result |
|---------|------|--------|
| `pnpm typecheck` (`tsc --noEmit`) | 0 | clean |
| `pnpm vitest run` | 0 | 10 files, 46 tests pass (incl. 7 new constellation + 3 new hud-settings) |
| `pnpm vite build` | 0 | built in ~2.7s; SettingsWidget code-splits to its own 3.58 kB chunk |

## What landed

1. **Constellation background** — `src/studio/background/constellation.ts` (pure sim, unit-tested) + `ConstellationCanvas.tsx`. ~32 nodes drift in normalized space, distance-faded cyan links, a few NODE_PALETTE hues at whisper alpha. Throttled ~30fps, paused on `document.hidden`, DPR-aware ResizeObserver, `prefers-reduced-motion` (or settings override) → one static frame. Layer opacity 0.5, `pointer-events:none`, z 0 under the dotted-grid scrim (moved to `.studio-shell::before`).
2. **Surface ladder + glass chrome** — `HUD_SURFACES` (sunken/base/raised/hover, ~4-5% lightness steps) + `HUD_EASE_OUT_QUART` in tokens.ts, exposed as CSS vars in StudioApp. WidgetWindow gains the wiki `.glass-tile` shadow stack (specular top, recessed bottom, cyan breath), hover lift, and 1px inset accent focus ring; header rides the raised rung; chrome buttons get `.studio-chrome-btn` hover + focus-visible ring.
3. **Settings surface** — new `SettingsWidget.tsx` (singleton catalog widget, `SlidersHorizontal` icon): hand-cursor toggle, ambient-background toggle, motion override segments (Auto/Full/Reduced), read-only TTS voice line (lazy-loads `@/settings`, degrades gracefully off-tauri). Glass register, hairline-sectioned rows, mono uppercase micro-labels.
4. **Micro-animations** — drawer surface ladder + `.studio-drawer-tile` hover-lift/focus ring; layout/tray/drag-ghost/glint transitions unified on ease-out-quart; transforms/opacity only; reduced-motion drops the lift.

## Screenshot-review list for the conductor (Playwright/vision)

Boot the desktop app (or the studio in the vite dev shell) and check:

1. **Background alive but quiet** — constellation nodes drift slowly, links fade with distance, cyan low-opacity; reads as atmosphere, not content. Dotted grid still sits ON TOP as a scrim; rulers + vignette intact.
2. **Reduced-motion** — with OS reduced-motion (or Settings → Motion → Reduced), the background paints ONE static frame and stops (no drift).
3. **Background off** — Settings → Ambient background off removes the canvas entirely (no idle rAF).
4. **Widget chrome glass depth** — a summoned widget (e.g. Clock) reads with glass depth: specular top edge, recessed bottom, faint cyan breath. Hover deepens border toward cyan + lifts; keyboard focus shows the 1px inset accent ring (no outer offset). No white smear on the dark canvas.
5. **Drawer** — open the drawer; catalog + stowed tiles lift ~1px on hover with a raised rung + inset top highlight; focus shows the inset ring. Drawer body reads one lightness step above the sunken tiles.
6. **Settings widget** — summon Settings from the drawer/catalog: hairline-sectioned rows, toggles animate their knob, motion segments highlight the active mode, voice line shows TTS state. Matches the glass chrome register.
7. **No jank alongside camera + voice** — with hand tracking on (camera) and a voice turn in flight, confirm no dropped-frame jank from the constellation loop (30fps throttle + visibility pause budget).

## Notes / deviations

- Research referenced a `studio/settings.ts` UI module that does not exist in this worktree; the real settings live in `apps/desktop/src/settings.ts` (tauri-store). The new HUD-visual prefs (background, motion) get their own small persisted store `state/hud-settings.ts`; the widget reads the tauri TTS settings read-only.
- `noUncheckedIndexedAccess` is on: constellation link/node indexing is guarded.

## Loop-2 fixes

Two nits from the conductor's screenshot review (vite dev on :1420, viewport 1600x1000), both fixed and re-verified headless.

1. **Talk-to-JARVIS button obscured** (`apps/desktop/src/studio/drawer/Drawer.tsx`) — collapsed, the widget-drawer pull tab and the bottom-center "Talk to JARVIS" invoke button both sat dead-center and overlapped (only "T..." peeked out). The drawer is now anchored `left: 50%` for both states with position driven by animated motion values (`x`/`width` in `animate`, constant `left`): open, it tweens back to `x: -50%` (dead-center over the stage); collapsed, it tweens to `x: calc(-50% + 240px)`, nudging the 184px pull tab clear to the right of the centered footer button. Motion values are used instead of a `layout` tween because `layout` pinned the box to its collapsed anchor and never re-centered on open. The enlarged 184px collapsed hit target is preserved.

2. **Floating catalog chip row** (`apps/desktop/src/studio/windows/WidgetWindowLayer.tsx`) — the detached bottom-right chip row (Browser, WhatsApp, Weather ... JARVIS Orb) was the `debugSummon` nav, which rendered the full catalog and defaulted on via `import.meta.env.DEV`, so it always showed in vite dev. Default flipped to `false`; the nav now only renders in the standalone `studio/debug/main.tsx` harness (which passes `debugSummon` explicitly). The full catalog is thus contained; the real app's catalog lives only inside the open drawer.

**Verification (all green):**
- `pnpm typecheck` (tsc --noEmit) — clean.
- `pnpm test` (vitest run) — 16 files, 92 tests passed.
- `vite build` — built OK (only pre-existing chunk-size / dynamic-import advisories, unrelated).
- Headless screenshots (playwright MCP, 1600x1000): collapsed state shows "Talk to JARVIS ⌘⌃J" fully visible + centered with the WIDGETS tab clear to its right and no floating chip row; open state shows the drawer centered and symmetric (CATALOG left, STOWED right), catalog contained inside it.
