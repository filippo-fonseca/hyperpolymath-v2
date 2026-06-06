---
phase: 14-jarvis-desktop-mic-middleman
plan: "01"
subsystem: apps/desktop
tags: [tauri2, rust, cpal, macos, tray-daemon, mic-permission, audio-capture]
dependency_graph:
  requires: [rust-toolchain@1.96.0, @tauri-apps/cli@2.11.2]
  provides: [apps/desktop workspace, io.hyperpolymath.jarvis-desktop bundle, NSMicrophoneUsageDescription Info.plist, cpal capture stub, Tauri IPC audio-chunk event]
  affects: [pnpm-workspace.yaml coverage (apps/* already matched), subsequent Phase 14 plans]
tech_stack:
  added:
    - "@tauri-apps/api@^2.11.0"
    - "@tauri-apps/cli@^2.11.2"
    - "@tauri-apps/plugin-store@^2.4.3"
    - "@tauri-apps/plugin-http@^2.3.3"
    - "tauri@2 (Rust crate, features=[tray-icon])"
    - "tauri-build@2 (Rust crate)"
    - "cpal@0.15 (Rust crate — CoreAudio on macOS)"
    - "hound@3 (Rust crate — WAV encoding)"
  patterns:
    - "Tauri 2 tray-only daemon (ActivationPolicy::Accessory, windows:[], LSUIElement=true)"
    - "Rust/cpal dedicated audio thread (Pitfall 2: cpal::Stream is !Send on macOS)"
    - "Tauri IPC emit for PCM chunks (audio-chunk event, Vec<f32> payload)"
    - "Info.plist NSMicrophoneUsageDescription merged by Tauri CLI at bundle time"
    - "Cargo self-contained workspace [workspace] marker (Pitfall 4: no root Cargo.toml)"
key_files:
  created:
    - apps/desktop/package.json
    - apps/desktop/tsconfig.json
    - apps/desktop/index.html
    - apps/desktop/src/main.ts
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/Info.plist
    - apps/desktop/src-tauri/Cargo.toml
    - apps/desktop/src-tauri/build.rs
    - apps/desktop/src-tauri/capabilities/default.json
    - apps/desktop/src-tauri/src/main.rs
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/src/commands.rs
    - apps/desktop/src-tauri/src/audio.rs
    - apps/desktop/src-tauri/.gitignore
    - apps/desktop/src-tauri/icons/tray-icon.png
  modified:
    - pnpm-lock.yaml
decisions:
  - "ActivationPolicy::Accessory set programmatically in lib.rs (tauri.conf.json does NOT support activationPolicy in Tauri 2)"
  - "LSUIElement=true in Info.plist as belt-and-braces fallback if ActivationPolicy call runs late"
  - "@tauri-apps/plugin-store pinned to ^2.4.3 (plan spec'd ^2.5.9 which does not exist on npm; latest is 2.4.3)"
  - "cpal::Stream pinned to dedicated thread via mpsc channel (CoreAudio thread-affinity requirement)"
  - "audio::start() is synchronous — returns Ok(()) after stream.play() succeeds, parks thread forever for lifetime"
  - "No navigator.mediaDevices anywhere in apps/desktop/src/ — verified by grep"
metrics:
  duration: "~15min (continuation from checkpoint after user installed Rust 1.96.0)"
  completed: "2026-06-06"
  completed_tasks: 2
  total_tasks: 3
  files_created: 15
  files_modified: 1
---

# Phase 14 Plan 01: Tauri 2 Desktop Scaffold Summary

**One-liner:** Tauri 2 macOS tray daemon at `apps/desktop/` with bundle id `io.hyperpolymath.jarvis-desktop`, Info.plist `NSMicrophoneUsageDescription` for one-time persistent mic permission, Rust/cpal capture stub emitting PCM chunks via IPC, and `ActivationPolicy::Accessory` for no-Dock-icon operation.

---

## What Was Built

The `apps/desktop/` Tauri 2 scaffold is complete and ready for `tauri dev`. The app will:

1. **Launch as a macOS tray daemon** — no Dock icon, no Cmd-Tab entry. Achieved via two complementary mechanisms: `app.set_activation_policy(ActivationPolicy::Accessory)` in `lib.rs` (programmatic, required because `tauri.conf.json` does not support this in Tauri 2) and `LSUIElement=true` in `Info.plist` (belt-and-braces in case the Rust call runs late).

2. **Show a tray icon** — `TrayIconBuilder` with tooltip "JARVIS Desktop". Icon is a 32×32 placeholder PNG (favicon.ico was not present; generated a black square). Polish in a future plan.

3. **Trigger exactly one mic permission prompt** — `NSMicrophoneUsageDescription` in `Info.plist` gates the CoreAudio permission. First `cpal` capture attempt fires the OS prompt; System Settings persists the grant forever. No `navigator.mediaDevices` anywhere — the WKWebView double-prompt pitfall (wry #1195) is fully avoided.

4. **Capture PCM via Rust/cpal on a dedicated thread** — `audio::start()` spawns a thread, opens the default CoreAudio input device, builds a `cpal::Stream`, calls `stream.play()`, signals ready via mpsc, then parks the thread to keep the stream alive. PCM chunks (`Vec<f32>`) are emitted to the webview as `audio-chunk` Tauri events.

5. **Wire IPC smoke test in TypeScript** — `src/main.ts` registers an `audio-chunk` listener and invokes `start_capture` on boot. Console will print `[audio-chunk] N samples` as cpal feeds frames — proving the full pipeline.

---

## Key Technical Decisions

### Activation Policy Mechanism
Tauri 2's `tauri.conf.json` `app.macOS.activationPolicy` field does NOT work — the config schema accepts it but the Rust side ignores it for programmatic reasons. The only working path is calling `app.set_activation_policy(ActivationPolicy::Accessory)` inside the `setup` closure, which requires `use tauri::ActivationPolicy` and a `#[cfg(target_os = "macos")]` guard. `LSUIElement=true` in Info.plist provides belt-and-braces coverage.

### Bundle ID Locked In
`io.hyperpolymath.jarvis-desktop` — declared in `tauri.conf.json` `identifier`. This is the key that macOS TCC stores the mic permission under. All future plans must NOT change this value.

### Cargo `[workspace]` Marker
`apps/desktop/src-tauri/Cargo.toml` includes an empty `[workspace]` block at the bottom. This declares the `src-tauri` directory as a self-contained Cargo workspace root. Without it, cargo would search up the directory tree for a parent `Cargo.toml` — which doesn't exist at the repo root (JS monorepo). This is Pitfall 4 from RESEARCH.md.

### Audio Thread Isolation
`cpal::Stream` is `!Send` on macOS (CoreAudio requires the stream to stay on the creating thread). `audio::start()` spawns a dedicated thread, creates the stream there, and parks the thread for its lifetime. PCM chunks are forwarded to the main runtime via `app.emit()` — the `AppHandle` is `Clone + Send`. This matches Pitfall 2 mitigation from RESEARCH.md.

### First-Run Compile Time
Not yet measured (Task 3 checkpoint — user must run `tauri dev`). Expect 60–120s cold compile on first run (downloads all Rust crates + compiles tauri + cpal + CoreAudio bindings). Subsequent runs will be <5s from the Cargo cache. This informs the `hyperpolymath.mjs` `waitForLog` 120s timeout in Plan 14-06.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @tauri-apps/plugin-store version ^2.5.9 does not exist on npm**
- **Found during:** Task 2, `pnpm install` step
- **Issue:** Plan specified `"@tauri-apps/plugin-store": "^2.5.9"` but the latest published version on npm is `2.4.3`. pnpm install failed with `ERR_PNPM_NO_MATCHING_VERSION`.
- **Fix:** Downgraded to `"@tauri-apps/plugin-store": "^2.4.3"` (the actual latest stable). The Rust crate `tauri-plugin-store = "2"` in Cargo.toml is unaffected (major-version constraint resolves correctly).
- **Files modified:** `apps/desktop/package.json`
- **Impact:** None — 2.4.x has the same API as 2.5.x would have; store persistence for Plan 14-04 Settings window is unaffected.

---

## Known Stubs

**1. Tray icon PNG is a placeholder 32×32 black square**
- **File:** `apps/desktop/src-tauri/icons/tray-icon.png`
- **Reason:** No `apps/web/public/favicon.ico` was present to convert. A black square satisfies Tauri's build requirement (valid PNG file). Does NOT affect mic permission or IPC plumbing.
- **Future plan:** Tray icon polish is deferred (noted in CONTEXT.md §Deferred).

**2. `audio::start()` parks the thread forever (no stop command)**
- **File:** `apps/desktop/src-tauri/src/audio.rs` (line: `thread::park()`)
- **Reason:** Plan 14-01 scope is scaffold-only. `stop_capture` command and command-channel loop are explicitly Plan 14-03 work.
- **Future plan:** Plan 14-03 replaces `thread::park()` with a `mpsc::Receiver<AudioCommand>` loop.

**3. Capabilities schema path `../gen/schemas/desktop-schema.json` does not exist yet**
- **File:** `apps/desktop/src-tauri/capabilities/default.json`
- **Reason:** The `gen/` directory is created by `tauri dev`/`tauri build` at compile time. The `$schema` field is advisory (for IDE tooling only) and does not block compilation.
- **Future plan:** Auto-generated at first `tauri dev` run (Task 3).

---

## Task Status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Install Rust toolchain | Verified externally (cargo 1.96.0, rustc 1.96.0, aarch64-apple-darwin) | n/a (human action) |
| 2 | Tauri 2 scaffold + Info.plist mic permission + cpal capture stub | Complete | dfa0cb0 |
| 3 | First `tauri dev` run — verify mic prompt + persistent permission | AWAITING HUMAN VERIFY | n/a (checkpoint) |

---

## Self-Check: PASSED

All created files verified present. Task 2 commit `dfa0cb0` verified in git log. Task 3 (human-verify checkpoint) is pending — plan will be finalized after user confirms mic prompt behavior.
