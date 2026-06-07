# Phase 14: JARVIS Desktop Mic Middleman — Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Source:** /gsd:plan-phase 14 (post-research clarifying questions, recommendations accepted)

<domain>
## Phase Boundary

What this phase delivers:
- A Tauri 2.x macOS menu-bar daemon at `apps/desktop/` that owns the system microphone with persistent OS-level permission (one `NSMicrophoneUsageDescription` prompt at first launch; persisted forever in System Settings → Privacy & Security → Microphone — no more Safari per-session prompts during voice turns).
- Two wake-trigger modes, both shipped functional in this phase, toggleable + concurrent: **Physical Extender** (subscribes to existing `/api/jarvis/physical/trigger` SSE; ESP32 fires wake) and **Standalone** (on-device openWakeWord on the desktop's own mic).
- After wake: capture audio via Rust/cpal (NOT WKWebView getUserMedia — see decisions below) + VAD silence detection, upload WAV to a new `/api/jarvis/voice/transcript` endpoint, server transcribes via Groq Whisper, server SSEs the transcript on the existing `physicalBus` channel as a new `"transcript"` event type.
- Browser receives transcript via the existing `use-physical-extension.ts` SSE subscriber (extended for the new event type), feeds it into the JARVIS pipeline as if the user typed it.
- Voice-source claim (in-memory scalar on the Next.js server, TTL ~30s heartbeat) — `desktopClaimed: boolean` is embedded in the trigger SSE payload so browsers atomically skip their own mic when desktop is active. No new SSE channel.
- Settings window in the desktop app (vanilla TS + minimal CSS, no React, no UI-SPEC.md needed — utility-grade): mode toggle, VAD threshold ms, trigger debounce ms, wake-word model + score threshold (Standalone only), transcribe endpoint URL, verbose-log toggle. Persists in app data dir, applies live without restart.
- `hyperpolymath` boot tool gains a `desktop` service entry that spawns `pnpm --filter desktop tauri dev`.

What this phase does NOT deliver (deferred):
- `Cmd+Shift+Space` global hotkey
- FN-double-tap CGEventTap
- HUD chrome / main app window
- HUD-dismiss interrupt for in-flight Anthropic stream + TTS playback (was old DESK-04; 999.7 returned to backlog)

</domain>

<decisions>
## Locked Decisions (from user via AskUserQuestion 2026-06-06)

### Audio capture path
- **Use Rust/cpal (CoreAudio bindings) for microphone capture, NOT WKWebView `getUserMedia`.**
  Source-of-truth rationale: research found a documented wry/WKWebView macOS issue (wry #1195) where `navigator.mediaDevices` can be undefined and permission prompts fire twice. Rust-side capture via cpal + `Info.plist` `NSMicrophoneUsageDescription` is the proven path; ~10-20ms capture latency vs ~300-400ms via WKWebView. Audio frames are piped to the webview via Tauri IPC for VAD + upload.

### Speech-to-text location
- **Server-side STT.** Desktop POSTs the captured WAV blob to a new `POST /api/jarvis/voice/transcript` endpoint; server transcribes via Groq Whisper (the same provider the web app uses today) and SSEs the resulting text to all browser subscribers.
- Rationale: one Groq API key on the server (no key embedded in the desktop binary), server-side rate limiting / provider swap stays centralized, desktop stays dumb.

### Standalone wake-word mode scope
- **Phase 14 lands the openWakeWord pipeline inside the desktop app now.**
- The ONNX model + Web Worker code (mirrors Phase 12's planned browser-side pipeline) lives in `apps/desktop/` for now. Phase 12 will share the assets and protocol when it builds the browser-side variant.
- Latency budget: wake event must fire within ~500ms of speech end.

### Settings UI tech
- **Vanilla TypeScript + minimal CSS.** Single `index.html` shipped from the Tauri webview. No React, no Tailwind, no shadcn.
- **No UI-SPEC.md required for this phase** — utility-grade tray-app UI, not brand-critical.

### Auth for desktop ↔ server
- **Reuse `PHYSICAL_TRIGGER_SECRET`.** Desktop sends the same `X-Trigger-Secret` header that the serial bridge sends today.
- One env var to manage. Both clients are localhost-only single-user processes; no need to multiply secrets.

### Voice-source claim mechanism
- In-memory scalar on the Next.js server: `{ owner: 'desktop', expiresAt: number } | null`. No Supabase row, no Redis. TTL 30s. Desktop heartbeat every ~10s.
- The trigger SSE payload embeds `desktopClaimed: boolean` so browser coordination is atomic — no separate poll.
- Browser falls back to its existing mic flow within ~1s of heartbeat lapse — verifiable via the success criteria.

### Reuse vs reinvent
- VAD capture logic: PORT the on-demand mic logic from `apps/web/components/jarvis/JarvisConsole.tsx` (commit `27125ac`) into the desktop app. Do not reinvent.
- Wake-word pipeline: shared ONNX model + protocol with the (not-yet-built) Phase 12 browser variant. Lift into a shared package only if cost is low; otherwise duplicate and let Phase 12 unify.
- Trigger SSE channel: extend the existing `physicalBus` channel with a new `"transcript"` event type. Do NOT introduce a new SSE channel.

### Out of scope (deferred)
- Global hotkey (`Cmd+Shift+Space`), FN-double-tap, HUD chrome, dismiss-interrupt → future phase.
- Cross-platform (Windows/Linux desktop) → macOS-only for this phase, but don't actively block portability in code structure.

### Claude's Discretion
- Exact Tauri 2 plugin selection beyond core requirements (e.g., autostart? notification on first launch?) — planner picks.
- Audio buffer size / sample rate at the Rust capture layer — planner picks based on Whisper input requirements.
- Settings persistence file format (JSON in app data dir) — planner picks.
- Wave/plan slicing — planner decides count and breakdown.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/phases/14-jarvis-desktop-mic-middleman/14-RESEARCH.md` — Technical research output (cpal vs WKWebView, openWakeWord port, voice-source claim, hyperpolymath integration, risk register)

### Roadmap + Requirements
- `.planning/ROADMAP.md` (Phase 14 section, lines 360+) — Goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` (DESK-01..06) — The six requirements every plan must cover

### Existing code to port / extend (read before touching)
- `apps/web/components/jarvis/JarvisConsole.tsx` — Browser-side wake/mic/transcribe flow; specifically the on-demand mic logic from commit `27125ac`. PORT the VAD silence detection into the desktop app.
- `tools/jarvis-physical/bridge/jarvis-serial-bridge.mjs` — ESP32 → HTTP serial bridge; the existing wake-trigger source. Do not modify.
- `tools/hyperpolymath/hyperpolymath.mjs` — Dev stack boot tool. Add a `desktop` service entry to the `SERVICES` array; match the existing `{ name, color, port?, preflight?, start, ready, keepAlive? }` shape.
- The existing `/api/jarvis/physical/trigger` route + `physicalBus` SSE channel (find via grep in `apps/web/app/api/`) — extend with `"transcript"` event type; embed `desktopClaimed` in the trigger payload.
- `apps/web/.../use-physical-extension.ts` (browser SSE subscriber) — extend to handle the new `"transcript"` event by dispatching a `jarvis-voice-transcript` window event.

### Project conventions
- `CLAUDE.md` — Stack constraints, anti-shallow rules, "Don't add features beyond what the task requires" / "Don't add error handling for scenarios that can't happen" / quality bar "Be goated. Well."

</canonical_refs>

<specifics>
## Specific Ideas

- **Bundle ID:** `io.hyperpolymath.jarvis-desktop` (or whatever matches the project's namespace convention — confirm with user at scaffold time).
- **Activation policy:** `accessory` (no Dock icon, tray-only).
- **Tray icon:** simple monochrome glyph; matches the Renaissance brand voice if possible, but utility-grade is fine.
- **Capture format:** 16 kHz mono PCM is the safe Whisper input; Rust/cpal can resample at capture.
- **VAD silence threshold default:** match the existing browser default (port from `JarvisConsole.tsx` commit `27125ac`).
- **5s follow-up window:** the recent commit `a0be051` added a 5s follow-up window after TTS ends. Confirm this survives the desktop middleman path — desktop should listen for the "TTS ended" signal from the browser via SSE and re-open mic accordingly.

</specifics>

<deferred>
## Deferred Ideas

- Global hotkey (`Cmd+Shift+Space`) — future phase ("Desktop Shell + Global Hotkey").
- FN-double-tap CGEventTap — same future phase.
- HUD chrome / main window — same future phase.
- HUD-dismiss interrupt for in-flight stream + TTS — 999.7 back in backlog.
- Cross-platform (Windows/Linux desktop) — design choices should not actively prevent future portability, but no Windows/Linux work in this phase.
- Auto-update — out of scope; user runs `tauri dev` or builds locally.
- Code signing / notarization for distribution — out of scope for personal dev; local builds only.

</deferred>

---

*Phase: 14-jarvis-desktop-mic-middleman*
*Context gathered: 2026-06-06 via /gsd:plan-phase 14 clarifying questions*
