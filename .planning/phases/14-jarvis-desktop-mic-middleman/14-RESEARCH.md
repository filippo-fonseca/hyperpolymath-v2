# Phase 14: JARVIS Desktop Mic Middleman — Research

**Researched:** 2026-06-06
**Domain:** Tauri 2.x macOS menu-bar daemon, Rust/cpal audio capture, voice-source claim API, openWakeWord desktop port, browser mic coordination
**Confidence:** HIGH for audio capture architecture and browser coordination. MEDIUM for WKWebView getUserMedia reliability (known open bug, mitigation documented). MEDIUM for Tauri 2 Cargo workspace setup (well-documented but no existing monorepo).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-01 | Tauri 2.x macOS menu-bar app at `apps/desktop/`, tray icon, Settings window; Info.plist `NSMicrophoneUsageDescription` for persistent OS-level mic permission | Tauri 2.11 + `activationPolicy: "accessory"` + `src-tauri/Info.plist` pattern; see Q1 + Q2 |
| DESK-02 | Two wake-trigger modes (Physical Extender: subscribe to `/api/jarvis/physical/events` SSE; Standalone: on-device openWakeWord) — either or both | SSE EventSource subscription from Tauri webview works; wake-word pipeline already ships in Phase 12; see Q3 + Q4 |
| DESK-03 | On wake: capture audio via raw Web Audio + VAD, POST audio to `/api/jarvis/stt`, POST transcript to new `/api/jarvis/voice/transcript`; server SSEs transcript to browsers | Audio capture architecture (Rust/cpal IPC); transcript dispatch route design; see Q4 + Q6 |
| DESK-04 | Voice-source heartbeat claim (TTL ~30s); browser skips mic when heartbeat fresh; fallback within ~1s when desktop quits | In-memory server map design; browser check-on-wake pattern; see Q5 + Q7 |
| DESK-05 | Settings window: mode, VAD threshold, debounce, wake-word model + score, transcribe endpoint, verbose log; persisted across restarts | `@tauri-apps/plugin-store` for persistence; Settings webview window; see Q5 |
| DESK-06 | `hyperpolymath.mjs` gains `desktop` service entry | Exact service entry shape documented; see Q8 |

</phase_requirements>

---

## Summary

Phase 14 builds a Tauri 2.x macOS menu-bar daemon that acts as a permanent mic middleman: it holds persistent OS-level microphone permission (granted once, stored in System Settings forever) and routes JARVIS voice turns through a server-side transcript dispatch endpoint rather than Safari's per-session mic prompt. The daemon subscribes to the existing ESP32 trigger SSE (Physical Extender mode), or runs on-device openWakeWord (Standalone mode), or both.

The most critical implementation risk is audio capture. Tauri's WKWebView has a documented, partially-unresolved `getUserMedia` reliability issue on macOS (wry issue #1195). The mitigation is a **Rust-side audio capture backend using cpal/CoreAudio** piped to the webview via Tauri IPC events — bypassing WKWebView entirely. This pattern is battle-tested in the wild (tambourine-voice, pluely) and provides better latency (~10–20ms vs ~300–400ms) than getUserMedia anyway. The VAD + capture logic then runs in Rust (or in the webview fed by Rust IPC chunks), and the final WAV is POSTed to the existing `/api/jarvis/stt` endpoint.

The second critical finding is **Rust toolchain not installed**. `rustup` + `rustc` are absent from this machine. This is a Wave 0 blocker — the first plan must install the toolchain before any Tauri CLI commands can run.

**Primary recommendation:** Build Phase 14 as ~5 plans. Wave 0: Rust toolchain + Tauri 2 scaffold + workspace wiring + `hyperpolymath` integration (DESK-06). Wave 1: voice-source claim/heartbeat API + browser coordination (DESK-04). Wave 2: Physical Extender SSE subscriber in Tauri + audio capture (Rust/cpal IPC) + VAD + STT dispatch (DESK-01 partial, DESK-02 partial, DESK-03). Wave 3: Standalone wake-word mode + openWakeWord in Tauri webview (DESK-02 full). Wave 4: Settings window + persistence (DESK-05) + end-to-end smoke.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/cli` | `^2.11.2` | Tauri 2 CLI (dev + build) | Current stable; verified 2026-06-06 on npm |
| `@tauri-apps/api` | `^2.11.0` | Tauri JS/TS API (events, invoke, tray) | Official; same minor as CLI |
| `tauri` (Rust crate) | `^2.5` | Tauri core runtime | Matches CLI minor via Cargo.toml; use `features = ["tray-icon"]` |
| `tauri-build` (Rust crate) | `^2` | Build-time Tauri codegen | Required in `build.rs` |
| `cpal` (Rust crate) | `^0.15` | Cross-platform audio I/O (CoreAudio on macOS) | De-facto Rust audio standard; used by production Tauri voice apps |
| `hound` (Rust crate) | `^3` | WAV encoding from cpal PCM data | Pairs with cpal for WAV-to-STT payloads |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/plugin-store` | `^2.5.9` | Persistent key-value store (Settings persistence) | DESK-05 settings window values |
| `@tauri-apps/plugin-http` | `^2.3.3` | Fetch from Rust via plugin (POSTing audio/transcript to Next.js) | Wake-word source claim heartbeat, transcript POST |
| `@tauri-apps/plugin-shell` | `^2.4.3` | Shell command execution | Not needed for this phase but useful for diagnostics |
| `onnxruntime-web` | `^1.26.0` (already in `apps/web`) | Wake-word ONNX inference | Phase 12 already ships this; reuse same ONNX assets |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rust/cpal for audio | `navigator.mediaDevices.getUserMedia` via WKWebView | WKWebView getUserMedia has documented reliability issues on macOS (wry #1195); cpal is more reliable, lower latency, and grants persistent OS permission cleanly |
| `@tauri-apps/plugin-store` | `fs` JSON file directly | Plugin handles atomic writes and OS-appropriate paths automatically |
| In-memory `Map<userId, {claimedAt}>` on Next.js server | Supabase row with TTL or Redis | Single-user app, single server instance; in-memory is zero-latency and no infra addition |

**Installation (inside `apps/desktop/`):**
```bash
pnpm create tauri-app@latest  # in apps/desktop, if scaffolding fresh
pnpm add @tauri-apps/api @tauri-apps/plugin-store @tauri-apps/plugin-http
pnpm add -D @tauri-apps/cli
```

**Rust toolchain (machine-level, one-time):**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Add to shell rc, then:
rustup target add aarch64-apple-darwin  # M-series Mac
```

---

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/
├── package.json           # name: "desktop", scripts: tauri dev/build
├── index.html             # minimal shell loaded by WKWebView
├── src/
│   ├── main.ts            # webview JS entrypoint
│   ├── settings-ui.ts     # Settings window React/Vanilla JS
│   └── wake-word/         # openWakeWord pipeline (Standalone mode)
│       ├── wake-word-worker.js    # copied from apps/web/public/workers/
│       └── wake-word-tap.js       # copied from apps/web/public/worklets/
└── src-tauri/
    ├── tauri.conf.json    # Tauri config (bundle ID, tray, accessory policy)
    ├── Cargo.toml         # cpal, hound, tauri, tauri-build deps
    ├── build.rs           # tauri_build::build()
    ├── Info.plist         # NSMicrophoneUsageDescription
    ├── capabilities/
    │   └── default.json   # http:default, store:default
    └── src/
        ├── main.rs        # setup_tray(), setup_windows(), app.run()
        ├── audio.rs       # cpal stream + PCM→WAV + Tauri IPC emit
        └── commands.rs    # #[tauri::command] start_capture, stop_capture
```

### Pattern 1: Tauri 2 macOS Menu-Bar App (No Dock Icon)

**What:** A Tauri 2 app with no main window on startup, a tray icon in the menu bar, and a frameless settings panel opened by clicking the tray.

**`tauri.conf.json` skeleton:**
```json
{
  "productName": "JARVIS Desktop",
  "identifier": "io.hyperpolymath.jarvis-desktop",
  "app": {
    "windows": [],
    "macOS": {
      "activationPolicy": "accessory"
    },
    "trayIcon": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": false
    },
    "security": {
      "capabilities": ["default"]
    }
  },
  "bundle": {
    "active": true,
    "targets": "app",
    "macOS": {
      "entitlements": null
    },
    "resources": []
  }
}
```

**`src-tauri/Info.plist`** (merged into bundle by Tauri CLI):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>JARVIS Desktop captures your voice commands to route them to the JARVIS pipeline. No audio is recorded or stored.</string>
</dict>
</plist>
```

`activationPolicy: "accessory"` removes the Dock icon and Cmd+Tab entry. Source: DEV Community "Building a Menubar App with Tauri v2", confirmed by Tauri docs.

### Pattern 2: Rust/cpal Audio Capture + Tauri IPC

**What:** Rust side captures microphone audio via cpal/CoreAudio on a dedicated thread, emits PCM chunks to the webview as Tauri events. Webview side runs VAD and buffers the command audio.

**Why Rust vs getUserMedia:** WKWebView `getUserMedia` has a documented reliability issue on macOS (wry issue #1195): double permission prompts, `NotReadableError` on some macOS versions, and permission not being stored persistently. Rust/cpal calls CoreAudio directly, respects `NSMicrophoneUsageDescription` for the OS prompt (shown once, persisted), and provides 10–20ms latency vs 300–400ms.

**`src-tauri/src/audio.rs` pattern:**
```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Manager};

pub fn start_capture(app: AppHandle) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("no input device")?;
    let config = device.default_input_config()
        .map_err(|e| e.to_string())?;
    
    let app_clone = app.clone();
    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[f32], _| {
            let chunk: Vec<f32> = data.to_vec();
            let _ = app_clone.emit("audio-chunk", chunk);
        },
        |err| eprintln!("[audio] error: {err}"),
        None,
    ).map_err(|e| e.to_string())?;
    
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}
```

**Webview-side listener** (JS):
```typescript
import { listen } from '@tauri-apps/api/event';

await listen<Float32Array>('audio-chunk', (event) => {
  // Feed into VAD silence detection (same logic as Phase 12 AudioWorklet ring buffer)
  vadBuffer.push(...event.payload);
});
```

The webview-side VAD uses the same ring-buffer + silence detection logic from Phase 12's `wake-word-tap.js` and `@ricky0123/vad-react` pipeline, translated to plain JS (no React needed here).

### Pattern 3: Voice-Source Claim API (In-Memory, Single-User)

**What:** Three endpoints on the Next.js server that let the desktop register heartbeat ownership and browsers check before activating their mic.

**Storage:** Module-level `Map<string, number>` in the Next.js server process (claim → claimedAt epoch ms). Single-user app, single Vercel serverless instance per deployment — no persistence needed; the 30s TTL means stale claims auto-expire.

```typescript
// apps/web/lib/voice/source-claim.ts — server-side module
const SOURCE_CLAIM_TTL_MS = 30_000;
let lastClaimedAt: number | null = null;

export function claimVoiceSource(): void {
  lastClaimedAt = Date.now();
}

export function getVoiceSourceStatus(): { claimed: boolean; expiresIn: number } {
  if (lastClaimedAt === null) return { claimed: false, expiresIn: 0 };
  const age = Date.now() - lastClaimedAt;
  if (age > SOURCE_CLAIM_TTL_MS) return { claimed: false, expiresIn: 0 };
  return { claimed: true, expiresIn: SOURCE_CLAIM_TTL_MS - age };
}
```

**Routes:**
- `POST /api/jarvis/voice/source/claim` — authenticated via `X-Desktop-Secret` header (shared secret in env, same pattern as `PHYSICAL_TRIGGER_SECRET`). Body: `{ source: "desktop-daemon" }`. Updates `lastClaimedAt`. Returns `{ ok: true, ttl: 30000 }`.
- `GET /api/jarvis/voice/source/status` — no auth required (browser checks this). Returns `{ claimed: boolean, expiresIn: number }`.

**Why not Supabase row:** Single-user, no persistence needed across server restarts. A Supabase round-trip would add 50–100ms per claim check. In-memory is the right tool here.

### Pattern 4: Transcript Dispatch Route

**What:** `POST /api/jarvis/voice/transcript` receives `{ transcript: string }` from the desktop, authenticates via `X-Desktop-Secret`, and fans the transcript out to open browser tabs via the existing `physicalBus` EventEmitter (the same bus that today fans out ESP32 wake triggers to the `/api/jarvis/physical/events` SSE stream).

**Key decision:** Reuse the existing `/api/jarvis/physical/events` SSE channel rather than creating a new one. Add a second event type `"transcript"` alongside `"trigger"`. The browser's `usePhysicalExtension` hook already listens to this SSE — extend it to also handle `"transcript"` events and dispatch `jarvis-voice-transcript` to the window, bypassing the browser's own STT flow.

**Why reuse the existing channel:** The `physicalBus` singleton and the SSE stream already exist and are battle-tested. Adding a second event type is a 5-line change. Creating a new SSE channel would duplicate infrastructure and add another EventSource subscription to the browser.

**`/api/jarvis/voice/transcript` route shape:**
```typescript
// POST /api/jarvis/voice/transcript
// Headers: X-Desktop-Secret: <PHYSICAL_TRIGGER_SECRET>
// Body: { transcript: string, sttDoneAt?: number, vadEndAt?: number }
// Response: { ok: true }
//
// Side effect: emits physicalBus.emit("transcript", { transcript, sttDoneAt, vadEndAt, at: Date.now() })
```

**Browser-side `use-physical-extension.ts` extension:**
```typescript
// Additional event listener in usePhysicalExtension:
source.addEventListener("transcript", (e: MessageEvent<string>) => {
  const payload = JSON.parse(e.data) as { transcript: string; sttDoneAt?: number; vadEndAt?: number };
  window.dispatchEvent(new CustomEvent("jarvis-voice-transcript", { 
    detail: { 
      transcript: payload.transcript, 
      sttDoneAt: payload.sttDoneAt ?? null,
      vadEndAt: payload.vadEndAt,
    }
  }));
});
```

This drops the transcript directly into the existing `jarvis-voice-transcript` window event that `JarvisConsole.tsx` and `GlobalJarvisHandler.tsx` already consume. Zero new browser dispatch paths.

### Pattern 5: Browser Mic Skip When Desktop Claimed

**What:** On each wake event (either physical trigger or wake-word), the browser checks the voice-source claim before opening its own mic.

**Recommendation:** Embed the claim status in the existing `trigger` SSE payload from the server, rather than having the browser make a separate `GET /api/jarvis/voice/source/status` request. The trigger handler already exists in `use-physical-extension.ts` and fires `jarvis-wake-fire`. Extend the trigger SSE payload to include `desktopClaimed: boolean`.

**Why embed vs separate poll:** Eliminates a round-trip on every wake event. The server knows the claim status at the time it fans out the trigger — it can stamp it on the payload atomically. The browser never needs a separate status fetch.

**`/api/jarvis/physical/trigger` route change:**
```typescript
// Current: emitPhysicalTrigger(payload)
// New: emitPhysicalTrigger({ ...payload, desktopClaimed: getVoiceSourceStatus().claimed })
```

**`use-physical-extension.ts` update:**
```typescript
const handleTrigger = (e: MessageEvent<string>) => {
  const payload = JSON.parse(e.data) as PhysicalTrigger & { desktopClaimed?: boolean };
  if (payload.desktopClaimed) {
    // Desktop owns the mic — don't open browser mic, just ack.
    return;
  }
  window.dispatchEvent(new CustomEvent(WAKE_FIRE_EVENT, { detail: payload }));
};
```

When the desktop is not running (heartbeat lapsed → `desktopClaimed: false`), the payload's flag is false and the browser fires `jarvis-wake-fire` as today, opening its own mic. Zero regressions.

### Pattern 6: openWakeWord in Tauri Standalone Mode (DESK-02)

**What:** Standalone mode runs on-device wake-word detection in the desktop Tauri app. The ONNX models + worker already exist from Phase 12 (`apps/web/public/wake-word/`, `apps/web/public/workers/wake-word.worker.js`).

**Reuse strategy:** Copy the Phase 12 assets into `apps/desktop/src/wake-word/`. The worker script (`wake-word.worker.js`) is pure ES module JavaScript — it does NOT depend on React, Next.js, or any web-specific API beyond `Worker` + `onnxruntime-web`. The AudioWorklet tap (`wake-word-tap.js`) is also pure processor JS.

**Key difference from browser:** In the Tauri webview, the audio feed comes from **Rust/cpal via IPC events**, not from `navigator.mediaDevices.getUserMedia`. The PCM chunks arrive as `'audio-chunk'` events; the webview script feeds them into the worker as `{ type: 'frame', pcm: Float32Array }` messages — the same message protocol the worker already expects from the browser's AudioWorklet.

No AudioContext or AudioWorklet is needed for the desktop wake-word path: the IPC event stream replaces the AudioWorklet + MediaStreamSource chain. The worker's internal inference pipeline (mel → embedding → classifier) is completely unchanged.

**Latency:** The wake-word pipeline fires within ~160ms of the phrase ending (2 consecutive 80ms frames at >0.5 score). Rust/cpal adds ~10–20ms at the capture layer. Total from phrase end to wake event: ~180–200ms — well within the <500ms requirement.

### Pattern 7: hyperpolymath `desktop` Service Entry

**Exact entry to add to `SERVICES` array in `tools/hyperpolymath/hyperpolymath.mjs`:**
```javascript
{
  name: "desktop",
  color: "blue",
  port: null,  // no HTTP port; tray daemon
  async preflight() {
    // If a Tauri dev instance is already running, skip start
    // (idempotent: `pnpm --filter desktop tauri dev` will fail if
    //  another instance holds the port, so check via lsof or process list)
    try {
      const out = execSync("pgrep -f 'tauri dev'", { encoding: "utf8" }).trim();
      if (out) {
        warn("desktop", "Tauri dev already running — skipping start");
        return { skipStart: true };
      }
    } catch { /* pgrep returns non-zero when nothing found */ }

    // Check Rust toolchain
    try {
      execSync("cargo --version", { stdio: "ignore" });
    } catch {
      warn("desktop", "cargo not found — install Rust via rustup first");
      return { skip: true };
    }
  },
  start: () =>
    spawn("pnpm", ["--filter", "desktop", "tauri", "dev"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  keepAlive: true,
  ready: (proc) => waitForLog(proc, /Running.*http:\/\/localhost/, 120_000),
},
```

**Note:** `ready` log pattern — `tauri dev` prints `Running on http://localhost:<port>` or similar when the webview is ready. Use a 120s timeout (Tauri compiles Rust on first run; subsequent runs hit the Cargo cache and are faster). The existing `waitForLog` helper in `hyperpolymath.mjs` works unchanged.

**`hyperpolymath.mjs` also needs:**
```javascript
const DESKTOP_DIR = resolve(REPO_ROOT, "apps/desktop");
```
and the new `--no-desktop` flag added to the `parseFlags` / usage docs pattern.

### Anti-Patterns to Avoid
- **`navigator.mediaDevices.getUserMedia` from WKWebView for the primary capture path:** Unreliable on macOS, double permission prompts, no persistent storage. Use Rust/cpal.
- **New SSE channel for transcript dispatch:** The `physicalBus` + `/api/jarvis/physical/events` channel already exists and is subscribed to. Add the `"transcript"` event type to the existing channel.
- **Separate `GET /status` poll from the browser on every wake:** Embed `desktopClaimed` in the trigger payload atomically.
- **Cargo workspace root at repo root:** The repo root has no `Cargo.toml` and adding one would conflict with the JS workspace. Keep Cargo self-contained inside `apps/desktop/src-tauri/` — it is its own Cargo workspace (no parent).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio capture on macOS | Custom CoreAudio Swift/ObjC bridge | `cpal` Rust crate | cpal wraps CoreAudio + handles all the threading (audio callbacks must run on the creating thread) + has Tauri IPC integration examples in the wild |
| Settings persistence | JSON file via `@tauri-apps/plugin-fs` | `@tauri-apps/plugin-store` | Store handles atomic writes, OS-appropriate paths, and type-safe get/set |
| WAV encoding from float32 PCM | Manual header + byte writing | `hound` Rust crate | WAV encoding has many gotchas (44.1kHz vs 16kHz header mismatch, chunk alignment); hound is 3 lines |
| SSE fan-out from desktop transcript | New EventEmitter + SSE endpoint | `physicalBus` existing channel + new event type | Bus already exists, SSE route already exists, browser already subscribed |

---

## Runtime State Inventory

This phase adds a new app (`apps/desktop/`) but does not rename, refactor, or migrate anything existing. No runtime state inventory required — no stored strings are being renamed and no existing runtime registrations embed a string that changes.

---

## Common Pitfalls

### Pitfall 1: WKWebView Double Mic Permission Prompt
**What goes wrong:** On some macOS versions, calling `getUserMedia` from the Tauri webview triggers both an OS-level permission prompt (for the bundle) and a webview-level permission prompt — even after the bundle has already been granted permission in System Settings.
**Why it happens:** WKWebView's `requestMediaCapturePermissionForOrigin` delegate re-prompts per origin/session, separate from the bundle's OS permission. This is an upstream WebKit + wry bug (wry #1195), partially fixed in macOS 14 but not uniformly.
**How to avoid:** Use Rust/cpal for primary capture — bypass WKWebView entirely. The OS permission prompt from the `NSMicrophoneUsageDescription` Info.plist key fires once at first `cpal` capture attempt via CoreAudio, then persists forever in System Settings → Privacy & Security → Microphone. Safari never re-prompts during desktop-mediated turns because the browser tab never calls `getUserMedia`.
**Warning signs:** DevTools console shows `getUserMedia` calls; System Settings shows the app listed but with "Ask" instead of "Allow" status.

### Pitfall 2: cpal Audio Thread Safety on macOS
**What goes wrong:** `cpal::Stream` is not `Send + Sync` on macOS (CoreAudio requires the stream to stay on the creating thread). Passing it across thread boundaries causes a compile error or runtime panic.
**Why it happens:** CoreAudio's HAL requires audio callbacks to run on the thread that initialized the stream.
**How to avoid:** Spawn a dedicated audio thread; pass commands in/out via `std::sync::mpsc` channels. The audio thread owns the `cpal::Stream` for its lifetime; the Tauri command handler sends `AudioCommand::Start/Stop` through the channel. This is the documented pattern from tambourine-voice and the cpal README.
**Warning signs:** Rust compiler error "does not implement Send/Sync"; or runtime "audio callback called from wrong thread".

### Pitfall 3: Tauri Dev vs Build Entitlements
**What goes wrong:** `tauri dev` runs the app in debug mode without code signing. The `NSMicrophoneUsageDescription` in Info.plist IS included in the debug bundle and the OS prompt fires correctly on dev builds. However, if you later need to distribute or notarize, you'll need a code signing identity.
**Why it happens:** Debug builds are not signed (no `.entitlements` file required) but they ARE bundled — the Info.plist is embedded. For personal-dev-only use (which is the current scope), unsigned dev builds work fine.
**How to avoid:** For now: `apps/desktop/src-tauri/Info.plist` with `NSMicrophoneUsageDescription` is sufficient. No `Entitlements.plist` needed until distribution. Do NOT set `tauri.conf.json` `bundle.macOS.entitlements` to a non-existent file — that will crash `tauri build`.
**Warning signs:** `tauri build` error about missing entitlements file; or the OS not prompting for mic permission (Info.plist not being read).

### Pitfall 4: pnpm-workspace.yaml and Cargo Workspace Conflict
**What goes wrong:** Adding `apps/desktop` to `pnpm-workspace.yaml` is required for `pnpm --filter desktop` to work. But if you also create a `Cargo.toml` at the repo root (common monorepo pattern), it conflicts with the existing JS-only workspace.
**Why it happens:** There is no `Cargo.toml` at the repo root. This repo is a JS monorepo. The Tauri app's `src-tauri/Cargo.toml` is self-contained — it IS its own Cargo "workspace" (no parent workspace member).
**How to avoid:** Only add `apps/desktop` to `pnpm-workspace.yaml`. Do NOT create a root `Cargo.toml`. The `src-tauri/Cargo.toml` has `[workspace]` as its own root (Tauri's default scaffold sets this). Cargo will work inside `apps/desktop/src-tauri/` without any repo-root Cargo config.
**Warning signs:** `cargo build` from repo root fails with "no Cargo.toml"; or pnpm workspace filter fails with "No projects matched".

### Pitfall 5: Heartbeat Claim Expiry During Long Turns
**What goes wrong:** The desktop registers a claim (TTL 30s) then takes >30s for a JARVIS turn (slow Claude response + TTS). The browser sees the heartbeat lapsed and opens its own mic for the follow-up window.
**Why it happens:** The heartbeat is a one-shot POST, not a recurring timer. If the JARVIS turn takes >30s, the browser's fallback logic kicks in.
**How to avoid:** The desktop should refresh the heartbeat on every wake event AND once more when the STT POST completes. Also emit a `keepAlive` refresh during TTS playback (every 15s). The heartbeat endpoint is cheap (in-memory write) — hammering it is safe.
**Warning signs:** Double-mic turn: browser + desktop both capture audio simultaneously.

### Pitfall 6: Tauri `tauri dev` Log Pattern for `waitForLog`
**What goes wrong:** `hyperpolymath.mjs`'s `waitForLog` pattern may miss the ready signal if `tauri dev` emits the log line before the pipeOutput listener binds.
**Why it happens:** On first build, Rust compilation takes 30–90s. The log line appears at the very end. `waitForLog` accumulates a `buf` from the stream — as long as the listener is attached before the process exits, it will catch the line. But if the log prefix differs between Tauri versions, the regex won't match.
**How to avoid:** Use a broad regex like `/Tauri app is running|Running on http:\/\/localhost|App is ready/i` with an OR pattern, and verify the actual log line output during the first `tauri dev` run. Set timeout to `120_000` (2 minutes) — Rust compile on a cold cache takes up to 90s.
**Warning signs:** hyperpolymath status bar shows `desktop` in `starting` state forever; grep reveals the log line doesn't match the regex.

### Pitfall 7: Double-Mic Conflict (Desktop + Browser Both Active)
**What goes wrong:** Desktop is running, browser does NOT check `desktopClaimed` flag, both capture audio simultaneously. Two STT requests race; whichever wins dispatches a transcript first; the second arrives and triggers a second JARVIS turn from the same audio.
**Why it happens:** Browser's `jarvis-wake-fire` handler opens mic unconditionally.
**How to avoid:** The `desktopClaimed` flag embedded in the trigger SSE payload (Pattern 5) is the guard. The browser hook `use-physical-extension.ts` must early-return when `payload.desktopClaimed === true`. Add a Vitest smoke assertion: when a trigger SSE payload has `desktopClaimed: true`, `jarvis-wake-fire` is NOT dispatched to the window.
**Warning signs:** Two JARVIS turns appearing in the scrollback from one voice command; telemetry shows two `stt_done_at` events within <500ms.

### Pitfall 8: `pnpm --filter desktop tauri dev` Requires Cargo in PATH
**What goes wrong:** hyperpolymath spawns the `desktop` service as `pnpm --filter desktop tauri dev`, which ultimately runs `cargo tauri dev`. If the Rust toolchain isn't in the shell PATH (e.g., `~/.cargo/bin` not sourced), the command fails with "command not found: cargo".
**Why it happens:** `spawn()` in Node.js inherits the parent process environment. If `hyperpolymath.mjs` is run from a shell that has `~/.cargo/bin` in PATH (e.g., after `source ~/.cargo/env`), it works. If run from a shell that doesn't, it fails.
**How to avoid:** The `desktop` service `preflight` should check `execSync("cargo --version", { stdio: "ignore" })` and skip with a helpful message if cargo is not found. The preflight (Pattern 7 above) already handles this.

---

## Research Answers to Specific Questions

### Q1: Tauri 2 macOS Bundle + Mic Permission

The exact approach (HIGH confidence):

1. `src-tauri/Info.plist` (placed in `apps/desktop/src-tauri/`):
   ```xml
   <key>NSMicrophoneUsageDescription</key>
   <string>JARVIS Desktop owns your microphone for voice commands.</string>
   ```
   Tauri CLI merges this with its generated Info.plist at build time (both `tauri dev` and `tauri build`).

2. `tauri.conf.json` does NOT need an `entitlements` field for personal dev use (unsigned builds). Only set it when distributing.

3. Bundle identifier convention: `io.hyperpolymath.jarvis-desktop` — reverse-domain + product slug.

4. `tauri dev` DOES produce a bundle (`.app` in `target/debug/bundle/`) with the Info.plist embedded. The OS permission prompt fires on the first cpal capture attempt against the bundle, then persists.

5. For personal dev: no code signing or notarization needed. macOS Gatekeeper will warn on first open from Finder — workaround is `xattr -d com.apple.quarantine` or right-click → Open. Since `tauri dev` launches the app directly, Gatekeeper doesn't apply at all during development.

### Q2: WKWebView getUserMedia in Tauri 2 on macOS

**Conclusion: Do not rely on WKWebView getUserMedia for the primary audio capture path.** (HIGH confidence — documented by multiple GitHub issues and independently verified by the tambourine-voice architecture analysis)

The `getUserMedia` call inside a Tauri WKWebView on macOS exhibits inconsistent behavior:
- On some macOS versions (pre-14), it shows a double permission prompt (OS-level AND webview-level)
- On some setups, `navigator.mediaDevices` is `undefined`
- The wry #1195 issue acknowledges partial fixes but no complete resolution as of the research date

**Use Rust/cpal instead.** The NSMicrophoneUsageDescription in Info.plist gates the CoreAudio permission request (one-time OS prompt, persisted). The webview never touches the microphone. Benefits: persistent permission, lower latency, no WKWebView permission complications.

The webview is still used for: Settings UI rendering, wake-word Worker execution (Standalone mode), ESS subscription (Physical Extender mode), and dispatch of the `jarvis-voice-transcript` window event to the browser tabs.

### Q3: openWakeWord on the Desktop

The Phase 12 wake-word pipeline (`wake-word.worker.js` + `wake-word-tap.js` + ONNX models) can be reused in the desktop app almost verbatim.

**Key difference:** In the browser, the AudioWorklet (`wake-word-tap.js`) feeds PCM frames to the worker via `postMessage`. In the desktop, the Tauri IPC `'audio-chunk'` event (from Rust/cpal) provides the PCM frames. The webview JS listens for IPC events and posts them to the wake-word Worker in the same `{ type: 'frame', pcm: Float32Array }` format the worker already expects.

```typescript
// Desktop webview JS (standalone mode):
await listen<number[]>('audio-chunk', ({ payload }) => {
  const pcm = new Float32Array(payload);
  wakeWordWorker.postMessage({ type: 'frame', pcm }, [pcm.buffer]);
});
```

The AudioWorklet is NOT needed in the desktop app — its only job was decimation + forwarding, which the IPC layer replaces.

**Sharing approach:** Copy the worker JS and ONNX files into `apps/desktop/` rather than importing from `apps/web` — the Tauri app is a separate bundle with its own asset server. A symlink or build-time copy step is cleaner than a cross-package import of static assets.

**Latency:** 180–200ms from phrase end to wake event (two 80ms frames + ~10ms cpal + ~10ms IPC round-trip). Within the <500ms requirement.

**No `tauri-plugin-microphone` or similar Rust wake-word library is needed.** The ONNX approach works and shares assets with the browser. The `openwakeword-rs` crate exists but is not maintained enough for production use.

### Q4: VAD + Capture Port

**Current VAD in JarvisListener.tsx (Phase 12 / commit 27125ac):**

The browser today uses `@ricky0123/vad-react` (`useMicVAD`) with `startOnLoad: true` and callbacks:
- `onSpeechStart`: sets `vadSpeakingRef.current = true`, dispatches FSM transition
- `onSpeechEnd`: captures `vadEndAt = Date.now()`, encodes WAV via `encodeWav(audio, 16000)`, POSTs to `/api/jarvis/stt`

VAD parameters (from `@ricky0123/vad-react` defaults): Silero VAD v5 ONNX, 10ms frame overlap, speech threshold ~0.5, silence threshold ~0.35, speech pad front/end 300ms each.

**Desktop port strategy:** Do NOT port `@ricky0123/vad-react` to the desktop. Instead, use the Silero VAD ONNX model (already in `apps/web/public/voice/silero_vad_v5.onnx`) directly in the same Web Worker as the wake-word pipeline — the wake-word worker already runs ONNX inference, so running VAD inference alongside it is a natural extension. Silence detection in the worker: track rolling RMS of recent PCM frames; dispatch `{ type: 'speech-end', audio: Float32Array }` to the webview when RMS drops below threshold for >500ms.

**Minimum lift to extract:** Single JS file: `apps/desktop/src/vad-worker.js` (~80 LOC). It runs Silero VAD ONNX + ring buffer + silence detection. The wake-word worker can remain separate (wake-word triggers start of capture; VAD worker runs during capture window). Or combine into one worker — Claude's discretion at plan time.

### Q5: Voice-Source Claim API

**Storage recommendation:** Module-level `Map` / scalar on the Next.js server (in-memory). See Pattern 3 above.

**Concrete API shape:**
- `POST /api/jarvis/voice/source/claim`: Auth via `X-Desktop-Secret: <PHYSICAL_TRIGGER_SECRET>` (reuse existing secret — desktop already knows it to POST to the physical trigger). Body: `{ source: "desktop-daemon" }`. Response: `{ ok: true, ttlMs: 30000 }`. Updates `lastClaimedAt`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Embed `desktopClaimed: boolean` in existing `"trigger"` SSE event payload (see Pattern 5). Browsers don't need a separate GET endpoint — they see the claim state on every wake event.
- Desktop should `POST /claim` on startup, on every wake event, and every 15s during an active turn (keep-alive timer).

**Auth note:** `PHYSICAL_TRIGGER_SECRET` is already in the desktop's environment (it uses it to POST wake triggers from the serial bridge). Reusing it for the desktop claim is correct — the trust model is identical (a local service authenticated by a pre-shared secret). No new env var needed.

### Q6: Transcript Dispatch Flow

**Current STT path in browser:** `JarvisListener.tsx onSpeechEnd` → `fetch('/api/jarvis/stt', { body: wav })` → response `{ transcript }` → `window.dispatchEvent(new CustomEvent('jarvis-voice-transcript', { detail: { transcript, sttDoneAt, vadEndAt } }))` → `JarvisConsole.tsx handleVoiceTranscript` → `handleSubmit({ input: transcript, isVoice: true })` → `streamJarvis` → `/api/jarvis`.

**Desktop new path:** Desktop Rust/cpal captures audio → VAD silence detection (desktop JS/worker) → WAV encoding → `POST /api/jarvis/stt` (from desktop, using stored auth token or cookie) → response `{ transcript }` → `POST /api/jarvis/voice/transcript` (to Next.js, auth via `X-Desktop-Secret`) → `physicalBus.emit('transcript', {...})` → SSE to browser tabs → `use-physical-extension.ts` dispatches `jarvis-voice-transcript` to `window` → existing `JarvisConsole.tsx` / `GlobalJarvisHandler.tsx` picks it up.

**Auth for desktop POSTing to `/api/jarvis/stt`:** The STT route requires Supabase session auth (`getClaims`). The desktop needs a Supabase access token. For MVP simplicity: the desktop Settings window has a "Connect" step that opens the web app's auth page via `open("https://app...")` and the user pastes their token — OR (better) the desktop reads the Supabase session cookie from the user's default browser session if the webview shares the same origin. The simplest approach: the transcript route `/api/jarvis/voice/transcript` handles STT inline (calls Groq directly on the server), so the desktop only needs to send raw WAV to that endpoint and get back a transcript + dispatch in one POST. This avoids any auth complexity on the desktop side.

**Revised flow (simpler):** Desktop POSTs WAV to `POST /api/jarvis/voice/transcript` with `X-Desktop-Secret` auth. The server-side route calls Groq STT, then fans out the transcript via `physicalBus`. Desktop never calls `/api/jarvis/stt` directly. This consolidates auth to the single `PHYSICAL_TRIGGER_SECRET`.

### Q7: Browser Coordination

**How the browser decides to activate its mic today:** `use-physical-extension.ts` listens to the `"trigger"` SSE event, dispatches `jarvis-wake-fire` to the window. `JarvisListener.tsx` listens for `jarvis-wake-fire` and calls `dispatch({ type: 'WAKE_WORD_DETECTED' })` which transitions the FSM from `listening` to `recording`, opening the VAD.

**Minimal change required:** Extend the `"trigger"` SSE event payload with `desktopClaimed: boolean` (Pattern 5 above). The `handleTrigger` function in `use-physical-extension.ts` becomes a 3-line guard. This is the minimal change — no new hooks, no separate poll, no context changes. The fallback path (desktop not running → `desktopClaimed: false`) is the current default behavior, so no regression is possible.

### Q8: hyperpolymath Integration

See Pattern 7 above for the exact service entry. The `apps/desktop` workspace also needs to be added to `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"   # already covers apps/desktop once the dir exists
  - "packages/*"
```
Because `pnpm-workspace.yaml` already has `apps/*`, adding `apps/desktop/package.json` is sufficient — no yaml edit needed.

### Q9: Workspace Setup

**pnpm-workspace.yaml:** No change needed — `apps/*` already covers `apps/desktop/`.

**`apps/desktop/package.json`:**
```json
{
  "name": "desktop",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.11.0",
    "@tauri-apps/plugin-store": "^2.5.9",
    "@tauri-apps/plugin-http": "^2.3.3"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.2"
  }
}
```

**`apps/desktop/src-tauri/Cargo.toml`** (abbreviated):
```toml
[package]
name = "jarvis-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "jarvis_desktop_lib"
crate-type = ["staticlib", "cdylib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-store = "2"
tauri-plugin-http = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
cpal = "0.15"
hound = "3"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

**Cargo workspace:** `apps/desktop/src-tauri/Cargo.toml` should have `[workspace]` at the top to declare itself a standalone workspace (Tauri CLI's default scaffold). This prevents cargo from looking up the directory tree for a parent workspace (which doesn't exist at repo root).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / rustup | Tauri 2 compilation (Wave 0) | ✗ | — | Must install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` |
| Cargo | Tauri 2 CLI build | ✗ | — | Installed by rustup above |
| Xcode CLI Tools | macOS native compilation | ✓ | Xcode app at `/Applications/Xcode.app` | — |
| pnpm | JS package management | ✓ | 9.12.0 | — |
| Node.js | JS runtime | ✓ | 20.18.1 | — |
| `@tauri-apps/cli` 2.11.2 | `tauri dev` / `tauri build` | ✗ (not installed) | — | Install in Wave 0 plan: `pnpm add -D @tauri-apps/cli --filter desktop` |
| cpal crate | Rust audio capture | ✗ (not installed) | — | Added to Cargo.toml in Wave 0 |
| PHYSICAL_TRIGGER_SECRET env | Desktop auth to claim/transcript routes | ✓ | (exists in .env) | — |
| GROQ_API_KEY env | STT on the server side | ✓ | (exists in .env) | — |

**Missing dependencies with no fallback:**
- Rust toolchain (`rustup` + `rustc` + `cargo`) — must be installed before any Tauri work. Wave 0 plan must include this step with verification.
- `@tauri-apps/cli` — installed as part of Wave 0 package.json setup.

**Missing dependencies with fallback:**
- None blocking the core functionality once Rust is installed.

---

## File-Tree Sketch

```
apps/desktop/
├── package.json              # name:"desktop", scripts:dev/build/tauri
├── index.html                # <script type="module" src="src/main.ts">
├── tsconfig.json             # strict, module:ESNext, target:ES2022
├── src/
│   ├── main.ts               # boot: init tray, settings-window, SSE subscription
│   ├── settings/
│   │   ├── window.ts         # open/close settings webview window
│   │   └── ui.html           # Settings UI (Vanilla HTML + TS, no React)
│   ├── physical-extender/
│   │   └── sse-client.ts     # EventSource → /api/jarvis/physical/events, dispatches wake
│   ├── audio/
│   │   ├── capture.ts        # listens to 'audio-chunk' Tauri event; buffers PCM
│   │   ├── vad.ts            # silence detection (Silero VAD via worker)
│   │   └── encode-wav.ts     # copied from apps/web/lib/voice/encode-wav.ts
│   ├── wake-word/            # Standalone mode
│   │   ├── worker.js         # copied from apps/web/public/workers/wake-word.worker.js
│   │   └── vad-worker.js     # silence detection web worker
│   ├── api/
│   │   └── client.ts         # POST /api/jarvis/voice/source/claim, /transcript
│   └── store/
│       └── settings.ts       # @tauri-apps/plugin-store wrapper
└── src-tauri/
    ├── tauri.conf.json
    ├── Cargo.toml
    ├── Cargo.lock
    ├── build.rs
    ├── Info.plist             # NSMicrophoneUsageDescription
    ├── icons/
    │   └── tray-icon.png
    ├── capabilities/
    │   └── default.json       # http:default, store:default
    └── src/
        ├── main.rs
        ├── lib.rs             # tauri::generate_handler![] + plugin registration
        ├── audio.rs           # cpal capture + Tauri event emit
        └── commands.rs        # start_capture, stop_capture, get_config
```

**New Next.js server files:**
```
apps/web/app/api/jarvis/voice/
├── source/
│   └── claim/route.ts          # POST — desktop heartbeat
└── transcript/route.ts         # POST — desktop sends WAV → STT → physicalBus dispatch

apps/web/lib/voice/
└── source-claim.ts             # in-memory claim state module
```

**Modified Next.js files:**
```
apps/web/lib/voice/physical-extension/use-physical-extension.ts   # add "transcript" event listener + desktopClaimed guard
apps/web/app/api/jarvis/physical/trigger/route.ts                  # add desktopClaimed to emitPhysicalTrigger payload
apps/web/lib/voice/physical-extension/bus.ts                       # if needed: add "transcript" event type to PhysicalBus

tools/hyperpolymath/hyperpolymath.mjs                              # add desktop service entry
pnpm-workspace.yaml                                                # no change needed (apps/* glob covers it)
```

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | `getUserMedia` chosen over Rust/cpal for audio, then fails on macOS | HIGH (if not mitigated) | HIGH — core feature broken | Use Rust/cpal from the start; decision must be locked in Wave 0 plan |
| 2 | Rust toolchain install fails or PATH issues in hyperpolymath | MEDIUM | HIGH — blocks all Tauri dev | Wave 0 plan verifies `cargo --version` in shell; desktop preflight gracefully skips |
| 3 | Double-mic conflict (browser + desktop both activate) | MEDIUM | HIGH — duplicate JARVIS turns | `desktopClaimed` flag in trigger payload; regression test asserts no `jarvis-wake-fire` when flag is true |
| 4 | `tauri dev` cold-build timeout in hyperpolymath `waitForLog` | HIGH (first run, 60–90s Rust compile) | LOW — just fails to start | 120s timeout in `waitForLog`; note in DESK-06 that first run takes longer |
| 5 | Heartbeat lapse during long JARVIS turn | LOW-MEDIUM | MEDIUM — double-mic on long turns | Desktop sends heartbeat on wake + every 15s during turn; TTL set to 30s |
| 6 | STT auth complexity for desktop → `/api/jarvis/stt` | MEDIUM | MEDIUM — need desktop-side Supabase token | Route all audio through `/api/jarvis/voice/transcript` (server-side STT) authenticated by `X-Desktop-Secret`; desktop never calls `/api/jarvis/stt` directly |
| 7 | ESP32 trigger arrives before desktop SSE subscription is established | LOW | LOW — first trigger on app start may be missed | EventSource auto-reconnects within <1s; missed triggers are edge-case (user doesn't say "Jarvis" in the first second after app launch) |
| 8 | Wake-word ONNX Worker fails to load in desktop webview | LOW-MEDIUM | MEDIUM — Standalone mode broken | Worker uses only standard `Worker` API + `onnxruntime-web`; Tauri WKWebView supports both; test explicitly in Wave 3 |
| 9 | Settings values not persisting across restarts | LOW | LOW | `@tauri-apps/plugin-store` is production-stable; test on first open |
| 10 | macOS notarization required for mic permission persistence | LOW | MEDIUM — mic prompt re-fires after restart if Gatekeeper quarantines | Personal dev: `tauri dev` bypasses Gatekeeper; unsigned `.app` from `tauri build` may need `xattr -d` on first run. Document in README. |

---

## Open Questions

1. **Desktop auth for heartbeat + transcript POSTs.** The plan above uses `PHYSICAL_TRIGGER_SECRET` (shared secret via env). For dev this is fine — the desktop has the `.env` file available since it runs in the repo. For a distributed build, this env var would need to be baked into the bundle or prompted in Settings. **Decision for planner:** confirm `PHYSICAL_TRIGGER_SECRET` env reuse is acceptable for DESK-04, or introduce a separate `DESKTOP_SECRET` env var.

2. **Groq STT auth on the server-side transcript route.** The `/api/jarvis/voice/transcript` route (as designed above) calls Groq directly on the server using the server's `GROQ_API_KEY`. This works cleanly — no user Supabase session needed. **Decision for planner:** confirm server-side STT (Groq called from Next.js, not from the desktop) is the intended architecture for DESK-03, or if desktop-side STT (desktop calls Groq directly) is preferred.

3. **Settings window tech.** Tauri Settings window is a webview window. Recommend Vanilla TypeScript + minimal HTML (no React, no Next.js) to keep the build surface small. The settings window is a form with ~7 fields — React overhead is not justified. **Decision for planner:** confirm vanilla TS for Settings UI.

4. **Phase 12 completion status.** DESK-02 Standalone mode requires openWakeWord working in the desktop. Phase 12 (browser openWakeWord) is planned but Plans 12-02 and 12-03 are not yet marked complete in ROADMAP.md. The desktop port of the wake-word pipeline can proceed independently of Phase 12 completion (the ONNX models + worker JS are already in `apps/web/public/`), but if Phase 12 changes the worker API, the desktop copy will need updating. **Decision for planner:** clarify whether Phase 12 must complete before Phase 14 Wave 3 (Standalone mode) starts.

---

## Sources

### Primary (HIGH confidence)
- Tauri 2 official docs (`v2.tauri.app`) — system tray, configuration, macOS bundle, capabilities
- `@tauri-apps/cli` npm registry — version 2.11.2 (verified 2026-06-06)
- `@tauri-apps/api` npm registry — version 2.11.0
- cpal crates.io — version 0.15.x, CoreAudio backend confirmed
- Phase 12 research (`12-RESEARCH.md`) + shipped code — openWakeWord pipeline, ONNX assets, worker protocol
- `apps/web/components/voice/JarvisListener.tsx` + `use-physical-extension.ts` — existing browser voice flow
- `apps/web/app/api/jarvis/physical/` — existing trigger + events routes
- `tools/hyperpolymath/hyperpolymath.mjs` — SERVICES array shape, waitForLog helper

### Secondary (MEDIUM confidence)
- DEV Community "Building a Menubar App with Tauri v2" — `activationPolicy: "accessory"` confirmed
- GitHub wry #1195 — WKWebView getUserMedia double-prompt issue, partially unresolved as of 2024
- tambourine-voice DeepWiki — cpal dedicated-thread pattern, IPC chunk emission
- Tauri macOS Application Bundle docs — `Info.plist` merge mechanism for NSMicrophoneUsageDescription
- Medium "Accessing voice control in tauri" (May 2026) — confirms getUserMedia unreliable, cpal recommended

### Tertiary (LOW confidence — verify before using)
- WebSearch results re Tauri 2 + pnpm monorepo — general patterns corroborated by official docs; Cargo workspace specifics should be verified against `tauri init` scaffold output

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm/crates.io 2026-06-06
- Architecture: HIGH — patterns derived from existing codebase + documented Tauri 2 capabilities
- Audio capture (cpal): MEDIUM-HIGH — confirmed working in wild but no project-specific smoke test yet
- WKWebView getUserMedia: MEDIUM — known bug, mitigation (cpal) verified; but actual behavior on this machine's macOS version not yet confirmed
- Pitfalls: HIGH — derived from documented bugs + existing codebase analysis

**Research date:** 2026-06-06
**Valid until:** 2026-08-01 (Tauri 2.x moves fast; re-verify plugin versions before execution)

## RESEARCH COMPLETE
