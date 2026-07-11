# Verification — desktop React shell

Date: 2026-07-11
Branch: `bgsd/desktop-react-shell`
Base: `next` (`a81a9dd7`)

## Acceptance criteria

### PASS — Full-size HUD window, tactical canvas, and React root

- `apps/desktop/src-tauri/tauri.conf.json` declares a decorated, resizable
  1512×945 main window with an 1100×700 minimum.
- A cold `pnpm tauri dev` build completed and launched
  `target/debug/jarvis-desktop`.
- A live macOS screen capture at 3024×1964 physical pixels showed the JARVIS
  window filling the usable display with the near-black dotted canvas, ruler
  ticks on all four edges, retained orb/transcript/invoke UI, and the React
  development chip reading `FSM · IDLE`.
- `#studio-root` is mounted before the retained overlay/legacy nodes and
  contains the empty `[data-studio-stage]` widget host.
- Fullscreen is reachable through F11 or Command+Shift+F via the Tauri window
  API.

### NOT INTERACTIVELY EXERCISED — Complete spoken voice turn

- The load-bearing wake, capture, transcript POST, SSE, response buffering,
  TTS, FSM, startup, action, and routine modules were not changed.
- `main.ts` retains the existing listener/boot sequence; its only behavioral
  addition is starting the studio bridge and mounting React before `boot()`.
- The compiled application launched successfully, but no microphone utterance
  was injected. macOS denied System Events scripted UI input (`-25208`), so an
  automated wake → capture → transcript → SSE → TTS turn was not claimed as a
  runtime pass.

### PARTIAL PASS — Bridge state transitions

- `src/studio/bridge.ts` subscribes to the existing FSM, capture, and SSE
  subscription APIs and publishes typed `jarvisState`, `transcript`,
  `response`, and `toolCall` events.
- The live development chip rendered the bridge snapshot as `FSM · IDLE`,
  proving the React root and bridge snapshot seam are connected.
- Listening/thinking/speaking transitions were not interactively exercised for
  the same macOS input limitation noted above.

### PASS (structural/runtime boot evidence) — QR, settings, tray, and routines

- The retained DOM still includes `#wa-qr-overlay`, `#wa-qr-canvas`,
  `#settings`, `#gear-btn`, `#orb-canvas`, `#wake-btn`, and `#ack-strip`.
- `main.ts` still calls `startWhatsappQrOverlay`, `wireWhatsappSettings`,
  `wireStartupWakeSettings`, `mountOrb`, `startScheduler`, and
  `refreshRoutines`, and still listens for `tray-invoke`.
- The Rust tray implementation and WhatsApp supervisor were not changed.
- During native boot, the WhatsApp supervisor reached its live health path and
  reported that it adopted the daemon responding on port 8080.
- The new React canvas is z-index 0; the legacy stage is z-index 1, settings is
  z-index 10, QR overlay is z-index 50, and disconnect banner is z-index 60.

### PASS — Automated checks

- `pnpm --filter desktop test`: 1 file passed, 12 tests passed.
- `pnpm --filter desktop typecheck`: passed (`tsc --noEmit`).
- `pnpm --filter desktop exec vite build`: passed; 523 modules transformed,
  production assets emitted in 877 ms. Vite reported only the pre-existing
  `env.ts` static/dynamic import chunking warning.
- `pnpm tauri dev`: Vite ready on port 1420; Cargo finished the cold dev build
  in 1m01s; native binary launched successfully; process stopped cleanly with
  Ctrl+C after visual verification.

## Scope and repository hygiene

- Five implementation commits were made with explicit pathspecs; no push was
  performed.
- No load-bearing module named in the seed was edited.
- The user-modified `.planning/fable-plan.md` was preserved and excluded from
  commits.
- Cargo's incidental lockfile rewrite from the dev boot was reverted.
- `.planning/BLOCKED.md` was not created because implementation is complete and
  no blocking condition remains.

---

# Verification — studio-core-port

Date: 2026-07-11  
Branch: `bgsd/studio-core-port`  
Base: `next`

## Acceptance criteria

### 1. Debug summon surface for all four widget kinds — PASS

- Temporary bare React mount: `apps/desktop/src/studio/debug/`.
- `WidgetWindowLayer` shows dev-only buttons for Browser, WhatsApp, Weather,
  and News.
- Headless Chrome exercise found all four labels and four rendered
  `[data-widget-window]` dialogs after summoning.

### 2. Mouse drag, resize, focus/z-order, pin, and close — PASS

Exercised against the bare Vite mount using Chrome DevTools pointer input:

- Browser drag delta: `80px × 60px`.
- Browser resize delta: `60px × 40px`.
- Browser pin/focus changed z-order from `1` to `5`.
- WhatsApp pin/focus then changed z-order to `6`.
- Closing News reduced the rendered window count from four to three.

### 3. Layout persistence across reload — PASS

- Store key remains `studio:widget-windows:v1`.
- The interactive exercise reloaded the page and restored all three remaining
  windows.
- Persisted Browser geometry after interaction was normalized as
  `x=0.6058201058`, `y=0.6079317697`, `w=0.4993650794`,
  `h=0.5852878465`.
- Unit tests cover persistence rehydration, clamping, singleton reuse, focus,
  and close behavior.

### 4. Weather/news/WhatsApp use the authenticated desktop HTTP path — PASS (wiring)

- All widget API calls use `studioFetch`; no bare `fetch()` remains under
  `src/studio/`.
- `studioFetch` uses `@tauri-apps/plugin-http`, prefixes
  `VITE_API_BASE_URL` (default `http://localhost:3000`), preserves caller
  headers, and applies the device bearer plus legacy trigger-secret fallback.
- Unit coverage verifies the exact localhost URL and both auth headers.
- Live receipts were not exercised: nothing was listening on port 3000, and
  the `next` base does not yet contain the studio API routes that exist on
  `bgsd/studio-v2`. The client-side implementation is complete; live response
  verification requires those web routes/server to be present at integration.

### 5. Typecheck and Vite builds — PASS

Commands run successfully:

```text
pnpm --filter desktop typecheck
pnpm --filter desktop test
pnpm --filter desktop exec vite build --outDir /tmp/studio-core-port-desktop-dist --emptyOutDir
pnpm --filter desktop exec vite build src/studio/debug --outDir /tmp/studio-core-port-debug-dist --emptyOutDir
```

Final test result: 15 tests passed across three files.

The standalone studio build transformed 2,044 modules and emitted lazy chunks
for Browser, News, Weather, and WhatsApp. Vite logged only dependency-level
`"use client"` directive warnings from React Query/Motion; the build completed.

### 6. Desktop-safe imports — PASS

```text
rg -n 'next/|@/' apps/desktop/src/studio
```

No matches.

## Merge seams

- `src/studio/tokens.ts` and `src/studio/debug/` are explicitly marked
  `TEMP: replaced by desktop-react-shell at merge`.
- Hand-gesture, voice-bridge, and WhatsApp realtime subscription integration
  are explicitly marked seams for their later owning units.
- The window layer is self-contained with its own React Query provider so it
  can run before the sibling shell is merged.
