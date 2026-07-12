# VERIFY — U4 voice-and-url-routing

Branch `l3/voice-url` off `bgsd/studio-native` @ f21b6958.

## Commits (atomic, explicit pathspecs)

| SHA | Type | Summary |
|-----|------|---------|
| da17703e | fix(desktop) | route open_url into the browser widget, not the system browser |
| 290d03e0 | feat(web) | machine-readable `reason` in the TTS 502 body |
| 1b4d2891 | feat(desktop) | local-voice TTS fallback so JARVIS is never mute (+ HUD chip, `say` capability) |
| 99ff6196 | test(desktop) | open_url routing table + tts local-fallback state machine |

## What shipped

### 1. URL leak fix
- `apps/desktop/src/actions/dispatcher.ts`: pure `routeOpenUrl(url, {studioAvailable})` → `"widget" | "system"`. http(s) + Studio up → widget; non-http scheme (mailto:/tel:/facetime:), unparseable URL, or Studio down → system opener.
- `apps/desktop/src/studio/actions/browser-router.ts` (new): single owner of "open URL in browser widget" with per-turn same-URL dedupe (bounded LRU of turnId → URL set, href-normalized) + `markStudioAvailable`/`isStudioAvailable`.
- `main.ts` tool-call handler: for `open_url`, routes to `openBrowserUrl(url, turnId)` when the table says widget; system `openUrl()` only as fallback. `materialize.ts` now routes its browser summon through the same deduped `openBrowserUrl`; `studio-action-router.ts` calls `noteBrowserUrl` so a sibling `open_url` for the same page is suppressed. `bridge.ts` marks Studio available on start.
- Net: a single "is England winning" turn opens the page once, in the widget; the system browser never launches when Studio is up.

### 2. TTS resilience
- `apps/desktop/src/audio/local-speech.ts` (new): `LocalSpeech` FSM. Backend 1 macOS `say -v Daniel` (UK butler) via Tauri shell `spawn` (killable Child); backend 2 web SpeechSynthesis (en-GB voice). Serial (each `speak()` awaits utterance completion); `stop()` kills the current utterance; a stop during a pending spawn supersedes it (generation counter).
- `apps/desktop/src/audio/tts-player.ts`: on `!res.ok` (and on network error) speaks the sentence locally instead of the old silent `console.warn; return`; flips `VoiceStatus` to `degraded` with the 502 reason; clears to `ok` on the next successful ElevenLabs sentence. `stop()` also stops LocalSpeech (barge-in parity). New `onVoiceStatusChange`/`getVoiceStatus`.
- `apps/desktop/index.html` + `main.ts`: amber "voice degraded" HUD chip in the status line (tooltip keyed off reason); hidden on recovery.
- `apps/desktop/src-tauri/capabilities/default.json`: added `say-voice` / `say-plain` shell scopes.
- `apps/web/app/api/jarvis/tts/route.ts`: empty/whitespace owner key → 502 `{reason:"key_missing"}` up front; ElevenLabs failure classified into `reason: "auth" | "transient"` in the 502 JSON.

### 3. Tests (23 new, all green)
- `apps/desktop/src/actions/dispatcher.test.ts` (8) — routing table.
- `apps/desktop/src/studio/actions/browser-router.test.ts` (7) — dedupe / studio-availability.
- `apps/desktop/src/audio/local-speech.test.ts` (8) — fallback state machine + interrupt.

## Verification (exit codes)

| Gate | Command | Result |
|------|---------|--------|
| desktop typecheck | `pnpm typecheck` (apps/desktop) | 0 — pass |
| desktop unit tests | `pnpm vitest run` (apps/desktop) | 0 — 11 files, 59 tests pass (23 new) |
| desktop bundle | `pnpm vite build` (apps/desktop) | 0 — built in 2.53s (only pre-existing chunk-size / dynamic-import warnings) |
| web typecheck | `pnpm --filter web typecheck` | 0 — pass (tts route touched) |

No cargo build run (disk). No Rust changed — `say` fallback uses the existing Tauri shell plugin via a capabilities allowlist entry only, so **no cargo check was needed either**.

## Manual smoke (not run here — needs the live stack + a broken ElevenLabs key)

1. **URL → widget, no system browser.** Ask "could you tell me if England is winning" with Studio up. Expect: the page opens in the in-app browser widget; the macOS default browser NEVER launches. Ask again in a new turn → opens again (cross-turn), same turn with model narrating + `studio_open_widget` + `open_url` → opens once (dedupe).
2. **Non-http still uses system opener.** A `mailto:`/`tel:` open_url should hand off to the system opener (widget can't render it).
3. **Studio-down fallback.** With Studio unavailable, an open_url falls back to the system browser (no regression).
4. **Voice never mute.** Set a stale/empty `ELEVENLABS_API_KEY`. Every reply should still be spoken via `say -v Daniel`; the amber "voice degraded" chip appears in the status line (tooltip reflects key_missing/auth vs transient).
5. **Recovery clears the chip.** Restore a valid key mid-session; the next spoken sentence clears the degraded chip.
6. **Barge-in parity.** While the local fallback voice is speaking, start a new turn / press Stop → the `say` process is killed immediately (no talk-over).

## Loop-2 live receipt: native `say` fallback (2026-07-11)

**Bug fixed.** The TTS local fallback shelled out via the Tauri shell plugin
(`Command.create("say-voice", …)`), whose `say-voice` / `say-plain` scope in
`capabilities/default.json` never registered at runtime — every spawn failed
with `Scoped command say-voice not found`, so the desktop fell through to web
`SpeechSynthesis` (which a global-hotkey invocation can't play).

**Fix.** Replaced the shell-plugin path with a dedicated Rust command pair,
`speak_fallback(text, voice)` / `speak_fallback_stop()` (`src-tauri/src/say.rs`),
mirroring the audio/whatsapp managed-process idiom: a single `/usr/bin/say`
child tracked in Tauri `SayFallback` state, killed before each new utterance for
barge-in. `tts-player.ts` → `local-speech.ts` `defaultLocalSpeechBackends.saySpawn`
now `invoke("speak_fallback", …)` (the invoke promise IS `done`, settling on true
utterance completion); barge-in kills via `speak_fallback_stop`. `SpeechSynthesis`
stays the off-Tauri / non-macOS fallback. Dead `say-voice` / `say-plain`
capability entries removed.

**Static verification.** `pnpm typecheck` clean; `pnpm vitest run` → 16 files /
92 tests pass (incl. `src/audio/local-speech.test.ts`, 8 tests); `cargo check`
in `src-tauri` exit 0. The running `pnpm tauri dev` hot-rebuilt the binary
(`target/debug/jarvis-desktop`, 21:29) picking up the new commands.

**Live verification.** Fired
`POST http://localhost:3000/api/jarvis/voice/text` (Bearer `hpd_…`) with
`{"text":"say a short test line"}` → HTTP 200,
`{"turnId":"98cdfb2a-4422-471f-8ee3-12efd7f63afb"}`. ~25s later, the new log
line (line 185, immediately after the pre-request marker at line 184) was:

```
[say] speaking fallback line (25 chars)
```

That is the `eprintln!` from the native `speak_fallback` command — the say path
ran and the line was spoken on the machine. The three
`Scoped command say-voice not found` errors in the log are all at lines 36-44
(the OLD shell-plugin failures, before the fixed binary rebuilt); ZERO new
scoped-command errors appeared for the post-fix turn. Fix confirmed.
