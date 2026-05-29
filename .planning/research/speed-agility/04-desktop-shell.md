# Research: Desktop Shell + Global Hotkey — May 2026

## TL;DR

**Tauri 2.x menu-bar wrapper around existing Next.js app + CGEventTap Rust module for FN-double-tap.** Next.js code keeps working largely as-is. FN-double-tap is achievable from Tauri using `tauri-plugin-macos-input-monitor` (CGEventTap FFI — already exists). **No Swift companion needed.**

## Per-Option Recap

### 1. Tauri 2.x menu-bar wrapper — RECOMMENDED
- Implementation: 1 phase to bootstrap (`tauri init`, wire `devUrl`/`frontendDist`, configure tray + window), 1 phase for shortcuts + audio.
- Maintenance: low. Same Next.js code + ~200 LOC Rust for tray + shortcut handlers. Tauri 2 stable late 2024; ecosystem matured 2025-2026.
- UX: tiny menu-bar icon. Hidden HUD window appears under tray on hotkey. Hide on blur. Browser-tab version keeps working in parallel — share Supabase, no sync needed.
- Bundle: ~3-10 MB native binary (Electron's ~100 MB+).

**Caveat — SSR**: Tauri only loads static frontends (`output: 'export'`). Current app uses Server Components, Server Actions, API routes. Three options:
  1. **Point Tauri's `devUrl`/`frontendDist` at deployed Vercel URL.** Tauri loads live web app over HTTPS into its webview. Simplest. Nothing about Next.js changes. Lose "ships offline" but gain "zero rewrite." **← USE THIS.**
  2. Convert to static export — gut Server Actions and API routes. Don't.
  3. Hybrid: static shell + API routes on Vercel. Adds complexity for nothing.

### 2. Electron
- Same idea, ~10× bundle, mature menu-bar patterns. No reason over Tauri 2 in 2026 unless you need Node runtime in app. You don't.

### 3. Native Swift menu-bar app + IPC
- Smallest binary, true native feel, full IOKit/CGEventTap.
- **Cost**: learn SwiftUI + AppKit, build second app, design auth handshake (Supabase session across two apps is non-trivial — likely localhost loopback + JWT).
- This is how Raycast does it (with a team). For one person, maintaining two codebases > polish gain. Skip.

### 4. Browser extension
- **Critical limit**: Chrome `commands` API with `"global": true` allows shortcuts when Chrome unfocused — but requires Chrome **running** and key combos restricted to `Ctrl+Shift+[0..9]` by default.
- **FN key NOT supported.** No browser extension can intercept FN — it never reaches the JS event layer on macOS (hardware-level modifier handled below the keyboard event chain).
- Useful as complement, not primary. Could be a Phase 0 stopgap.

### 5. macOS Shortcuts.app + URL scheme
- Works but janky: every invocation re-opens or focuses a browser tab. Can't deliver "JARVIS as HUD overlay over whatever I'm doing." Mic re-prompts awkward.
- Free 2-hour win for v0 if wanted before Tauri.

## FN-Double-Tap Feasibility (the hard question)

**Tauri's built-in `globalShortcut` plugin will NOT do FN.** Uses macOS `RegisterEventHotKey` under the hood:
- Application-level priority (system shortcuts win)
- Doesn't expose FN modifier as hotkey trigger (FN is hardware modifier, not Carbon hotkey keycode)
- Can't do "double-tap" detection — only single-press registration

**The actual path Wispr Flow uses**: CGEventTap with `kCGHIDEventTap` placement, inserted at `kCGHeadInsertEventTap`. Sits **above** macOS system event processing, sees every key event including FN's hardware flag (`kCGEventFlagMaskSecondaryFn`), enables custom double-tap timing (Wispr uses ~1 second window per their docs).

**Can Tauri do this?** Yes — two paths:
1. **`tauri-plugin-macos-input-monitor`** (crates.io, published mid-2025): exact CGEventTap FFI plugin, already strips `SecondaryFn` flag correctly, emits events to Tauri frontend. Need to add double-tap timing yourself (trivial — track timestamp of last FN release, fire if within 1000ms). Requires user to grant **Input Monitoring** permission in System Settings (one-time, same as Raycast/Wispr).
2. **Roll own**: ~150 LOC of Rust using `core-graphics` crate + `CGEventTapCreate`. Pattern well-documented (Hammerspoon, AeroSpace, EventTapper). Full control vs. community plugin dependency.

**Verdict**: no native Swift companion needed. CGEventTap C API callable directly from Rust via `core-graphics`. One codebase.

**Permission UX**: first launch prompts Input Monitoring (CGEventTap) AND Microphone (getUserMedia). Two one-time dialogs. Identical to Wispr Flow onboarding.

## Microphone in Tauri 2 — Sharp Edges

- `getUserMedia()` works in WKWebView, but **must** add `NSMicrophoneUsageDescription` to `Info.plist` via Tauri config or prompt silently never appears.
- **Open bug**: mic permission not always persisted across app restarts (Tauri issue #8979). Workaround patterns exist (re-prompt gracefully). Verify with 30-min spike before committing.
- Native alternative: do audio capture in Rust (`cpal` crate) and stream PCM to webview via Tauri events. More robust but adds work — only if persistence bug bites.

## Recommended Architecture (Phase 14 breakdown)

**14a — Tauri shell pointing at live web app** (~2-3 days)
- `apps/desktop/` Tauri 2 project alongside `apps/web/`.
- `tauri.conf.json`: `devUrl = http://localhost:3000`, `frontendDist = https://hyperpolymath.app` (prod URL).
- Tray icon + hidden HUD window with `tauri-plugin-positioner`. Hide-on-blur.
- Bind `Cmd+Shift+Space` via `tauri-plugin-global-shortcut` to toggle HUD. Ship first — proves the loop.
- Same Next.js code, same Supabase session. Cookie auth works because WKWebView persists cookies per-origin.

**14b — FN-double-tap via CGEventTap** (~2-3 days)
- Add `tauri-plugin-macos-input-monitor` OR custom 150-LOC `core-graphics` CGEventTap module.
- Detect `flagsChanged` events where `SecondaryFn` toggles; track last-up timestamp; fire JS event on second tap within 1000ms.
- Wire to same toggle handler as `Cmd+Shift+Space`.
- Onboarding for Input Monitoring permission.

**14c — Mic only when summoned** (~1-2 days, absorbs 999.7)
- Current `HudCoreBubble` and `JarvisDemo` always-listen behavior. Tauri version stops `getUserMedia` until HUD summoned; releases stream on dismiss.
- Wake-word listening becomes explicit setting toggle, off by default.
- Solves "browser mic always-on when tab focused" complaint.

## What Stays / What Changes

**Stays**: all of `app/`, all components, all Server Actions, all API routes, all Supabase wiring, all Anthropic SDK. Existing browser JARVIS keeps working untouched.

**Adds**:
- New `apps/desktop/` with `src-tauri/` (Rust) + minimal `package.json`.
- Small detection in `lib/` for `window.__TAURI__` — when running inside Tauri, swap mic activation from "always on" to "wait for `tauri://jarvis-summoned` event."
- `Info.plist` entries (Tauri config) for `NSMicrophoneUsageDescription`.

No rewrite. No SSR loss. No second app to auth.

## Sources

- Tauri Global Shortcut Plugin v2: https://v2.tauri.app/plugin/global-shortcut/
- Global Shortcuts in Tauri v2 (DEV 2026): https://dev.to/hiyoyok/global-keyboard-shortcuts-in-tauri-v2-the-right-way-and-the-wrong-way-2h6d
- tauri-plugin-macos-input-monitor: https://crates.io/crates/tauri-plugin-macos-input-monitor
- yigitkonur/tauri-plugin-key-intercept: https://github.com/yigitkonur/tauri-plugin-macos-input-monitor
- macOS Menu Bar HUD with Tauri 2 (DEV 2026): https://dev.to/hiyoyok/how-i-built-a-macos-menu-bar-hud-with-rust-tauri-20-pij
- Building a Menubar App with Tauri v2: https://dev.to/hiyoyok/building-a-menubar-app-with-tauri-v2-what-nobody-tells-you-9a2
- Tauri Next.js integration: https://v2.tauri.app/start/frontend/nextjs/
- Wispr Flow hands-free: https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free
- Wispr Flow hotkeys: https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
- chrome.commands API: https://developer.chrome.com/docs/extensions/reference/api/commands
- Tauri mic permission issues: #11951, #8979
- Hammerspoon eventtap reference: https://github.com/Hammerspoon/hammerspoon/blob/master/extensions/eventtap/libeventtap_event.m
- EventTapper Swift reference: https://github.com/usagimaru/EventTapper
