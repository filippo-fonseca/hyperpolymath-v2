---
plan: 14-01
status: complete
completed: 2026-06-06
requirements: [DESK-01]
---

# Plan 14-01 Summary — Tauri 2 scaffold + persistent mic permission

## What shipped

A working Tauri 2.x macOS desktop app at `apps/desktop/` with:
- pnpm workspace registration (`apps/desktop` matched by `apps/*` in root `pnpm-workspace.yaml`)
- Tauri 2.11 + cpal 0.15 + hound 3 dependencies in `src-tauri/Cargo.toml`
- `[workspace]` marker in `src-tauri/Cargo.toml` (Pitfall 4 — prevents root Cargo workspace absorption)
- `NSMicrophoneUsageDescription` Info.plist entry granting persistent OS-level mic permission keyed to bundle ID `io.hyperpolymath.jarvis-desktop`
- cpal-based audio capture on a dedicated thread (Pitfall 2 — `cpal::Stream` is not `Send`)
- IPC pipe from Rust to webview via Tauri `app.emit("audio-chunk", Vec<f32>)`
- Webview status window (480×360, vanilla HTML+JS, no bundler) showing mode, mic permission state, audio-chunk counter, bundle ID
- Tauri 2 capability grant for window "main" so JS can `event.listen` and `core.invoke`

## How it works end-to-end

1. User opens `JARVIS Desktop.app` via Spotlight / Finder / `open` — LaunchServices applies bundle Info.plist, process runs under `io.hyperpolymath.jarvis-desktop`
2. Webview loads `web/index.html` (set via `frontendDist: "../web"`)
3. JS calls `invoke('start_capture')`
4. Rust `start_capture` command spawns audio thread → cpal opens default input device → `build_input_stream` triggers macOS mic prompt with our `NSMicrophoneUsageDescription` text
5. User grants permission once → macOS persists in System Settings → Privacy & Security → Microphone under bundle ID
6. cpal callback fires repeatedly with PCM `&[f32]` → emit `audio-chunk` event to webview
7. Webview JS counts chunks, updates UI

## Verification (DESK-01)

| Check | Result |
|---|---|
| Bundle Info.plist has `NSMicrophoneUsageDescription` | ✓ verified via `plutil -p` |
| Bundle Info.plist has CFBundleIdentifier `io.hyperpolymath.jarvis-desktop` | ✓ verified |
| First-launch macOS mic prompt fires with custom description | ✓ verified by user |
| Audio chunks stream to webview after permission grant | ✓ verified live — counter tick |
| Permission persists in System Settings → Privacy & Security → Microphone | ✓ `tccutil reset Microphone io.hyperpolymath.jarvis-desktop` succeeded, proving bundle ID is in the TCC database |
| No `navigator.mediaDevices` references in `apps/desktop/src/` | ✓ grep clean |

## Deviations from plan

### 1. Pivoted from tray-only to GUI window
**Plan said:** "Tauri 2.x macOS menu-bar daemon ... tray icon" (per CONTEXT.md Decision: no main HUD window required).
**Reality:** Tray icon was invisible regardless of icon shape, size, or programmatic configuration. User requested mid-execution: "we could just do a desktop app GUI instead of worrying about the tray".
**Outcome:** Removed `ActivationPolicy::Accessory` and `TrayIconBuilder` from `lib.rs`; declared a 480×360 window in `tauri.conf.json`; removed `LSUIElement=true` from Info.plist. App now has a dock icon and a visible status window. The DESK-01 mic permission contract is satisfied identically — the bundle ID, NSMicrophoneUsageDescription, and persistence behavior are unchanged.

### 2. Tauri 2 capability grant required for events
**Discovered:** Tauri 2's per-window capability system rejected `event.listen` with `not allowed on window "main", webview "main"`. Default scaffold had `"windows": []` in `capabilities/default.json`, meaning permissions applied to zero windows.
**Fix:** Changed `"windows": []` → `"windows": ["main"]`. Also dropped the `core:tray:default` permission since the tray is removed.

### 3. frontendDist scope fix
**Discovered:** Scaffold had `frontendDist: "../"` which made `tauri build` fail with "frontendDist includes src-tauri/target, node_modules, src-tauri".
**Fix:** Created `apps/desktop/web/` for static assets; set `frontendDist: "../web"`. The old `apps/desktop/index.html` (which referenced `/src/main.ts` via `<script type="module">` that the webview can't transpile without a bundler) is deleted.

### 4. `withGlobalTauri: true` added
For the no-bundler webview to call Tauri APIs, `window.__TAURI__` needed to be injected. Added `withGlobalTauri: true` in `tauri.conf.json`.

### 5. Cargo.lock committed
Was untracked in the initial scaffold. Committed now so future builds are deterministic.

## Open follow-ups for downstream plans

- **`apps/desktop/src/main.ts` is orphaned.** Plans 14-03 and 14-04 list TypeScript files at `apps/desktop/src/audio/*.ts`, `src/wake-word/*.ts`, `src/settings/*.ts`, etc. These cannot be loaded by the webview without a bundler. Plan 14-03 will need to add Vite (or equivalent) and reorganize `frontendDist` + `beforeDevCommand` / `beforeBuildCommand`. Recommended Vite scaffold for Plan 14-03 to land:
  - Install `vite` + `vite-tsconfig-paths`
  - `vite.config.ts` with `root: 'web'`, `build.outDir: '../dist'`, `clearScreen: false`, `server.strictPort: true`, `server.port: 5173`
  - Move `web/index.html` to be the Vite entry; reference TS sources via `<script type="module" src="/src/main.ts">`
  - `tauri.conf.json`: `devUrl: "http://localhost:5173"`, `beforeDevCommand: "pnpm dev"`, `beforeBuildCommand: "pnpm build"`, `frontendDist: "../dist"`
- **CONTEXT.md decision drift:** the "no main HUD window (tray-only)" locked decision was overridden by user mid-execution. Plan 14-04's "Settings window" is now better-aligned with reality — the main window is the natural place for it.

## Commits

| Commit | What |
|---|---|
| `dfa0cb0` | Initial Tauri 2 scaffold (executor Task 2) |
| `71c4cac` | Fix tray-icon.png to RGBA |
| `baea1fe` | Tray icon visibility attempts — single source of truth |
| `6ea4469` | Bolder tray icon (J knockout) |
| `595db35` | Pivot from tray-daemon to GUI window |
| `(this commit)` | Plan 14-01 closure: LSUIElement removed from Info.plist, audio.rs debug logging removed, web/index.html debug box removed, capabilities scoped to window "main", SUMMARY rewritten |

## key-files.created

- `apps/desktop/src-tauri/Info.plist`
- `apps/desktop/src-tauri/src/audio.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/web/index.html`
- `apps/desktop/src-tauri/capabilities/default.json`

## Self-Check: PASSED

Plan 14-01's DESK-01 contract is satisfied: persistent OS-level mic permission keyed to our bundle ID, no Safari prompts, audio frames flowing from cpal → IPC → webview, verified live by the user.
