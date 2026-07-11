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
