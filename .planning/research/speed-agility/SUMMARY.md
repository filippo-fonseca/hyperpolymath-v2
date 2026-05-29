# Speed & Agility — Research Synthesis

**Date**: 2026-05-28
**Milestone**: v1.1 "Speed & Agility"
**Goal**: Cut p50 speech-end-to-first-TTS-audio under 1.5s (currently ~3-5s) without regressing JARVIS routing quality. Preserve 100% of current functionality. Absorb backlog stubs 999.6 / 999.7 / 999.8.

## User Decisions (locked 2026-05-28)

1. **Haiku fast-path routing (Phase 13): IN.** Accept routing complexity for ~50% of turns at ~2-3× speed; build eval set to gate misroute rate.
2. **TTS provider: KEEP ElevenLabs Flash + British voice.** No Cartesia switch. Move to `pcm_24000` output format only.
3. **Phase order: Browser-speed phases first (9 → 13), desktop shell (14) last.** Desktop is "just a mic thing" — doesn't impact perceived speed of existing browser app.

## Research Documents

| File | Topic | Key Finding |
|---|---|---|
| `01-inference.md` | Fast LLM inference (Groq / Cerebras / SambaNova / Haiku) | DO NOT swap primary path away from Sonnet 4.6 — quality drop on multi-tool agentic loops violates "misroute = fail" bar. Hybrid: Haiku 4.5 for unambiguous CRUD, Sonnet for ambiguous/multi-action. |
| `02-tts.md` | Streaming TTS providers (Cartesia / Deepgram / ElevenLabs / Inworld) | User keeps ElevenLabs Flash. Free win: switch `output_format` from `mp3_44100_128` → `pcm_24000` (drops MP3 decode, ~15-30ms saved). |
| `03-wake-word.md` | On-device wake-word (Porcupine / openWakeWord / Web Speech API) | Porcupine free tier ends **2026-06-30** — five weeks. Migrate to openWakeWord via onnxruntime-web + Silero VAD + `hey_jarvis_v0.1.onnx` in a Web Worker. ~3-4 MB lazy-loaded. CC BY-NC-SA models OK for personal use. |
| `04-desktop-shell.md` | Global hotkey + desktop wrapper options | Tauri 2 menu-bar wrapper pointing at the **deployed web app** (not static export — keeps Server Components/Actions). FN-double-tap via `tauri-plugin-macos-input-monitor` (CGEventTap, ~150 LOC Rust, no Swift companion needed). |
| `05-context-priming.md` | Prompt caching + state priming strategy | 3-tier cache: tools+frozen-system at **1h TTL**, user-state snapshot at **5min TTL**, per-turn outside cache. XML-tagged state block. NO heartbeat warmer (cost trap); predictive warm on app-focus. Estimated 400-600ms TTFB win. |
| `06-latency-audit.md` | End-to-end pipeline audit of current codebase | Top bottlenecks: (1) `use-tts-player.ts:98-107` buffers full MP3 body before decoding (~500ms tax); (2) TTS only fires on stream-close (multi-second waste on long answers); (3) tool executor sequential when could be parallel; (4) sequential DB queries at route boundary (15-30ms). |

## Proposed Phase Breakdown

| # | Phase | Days | Critical Path |
|---|---|---|---|
| 09 | Latency Telemetry Baseline | 1-2 | ✓ |
| 10 | TTS Quick-Wins (per-sentence dispatch + pcm_24000 + drop buffer + parallel DB) | 2-3 | ✓ |
| 11 | Prompt Cache + State Priming (3-tier + XML snapshot + state_version + predictive warm) | 3-4 | ✓ |
| 12 | Wake-Word On-Device + Mic Gating (openWakeWord + Web Worker + ring buffer; absorbs 999.6 + 999.8) | 5-6 | |
| 13 | Haiku Fast-Path Routing (classifier + eval set + telemetry) | 3-4 | |
| 14 | Desktop Shell + Global Hotkey (Tauri 2 menu-bar + FN-double-tap + mic-gated-on-summon; absorbs 999.7) | 7-10 | |

**Total: ~5-6 weeks.** Critical path (9 → 10 → 11) lands perceived-speed win in ~2 weeks.

## Backlog Absorption

- **999.6 Jarvis hibernation mode** → Phase 12 (mic-state setting: wake-word / push-to-talk / hibernate)
- **999.7 Jarvis interrupt/stop control** → Phase 14 (HUD-dismiss = interrupt; also covered partially in Phase 10 if barge-in ships)
- **999.8 Jarvis wake-word scoped, no ambient transcription** → Phase 12 exactly (audio never leaves device until wake fires)

## Non-Goals (explicit)

- **Inference provider swap to Groq/Cerebras/SambaNova** for primary agent path. Considered, rejected on quality grounds (BFCL/τ-bench multi-turn gap vs Sonnet 4.6). Reserve those providers for non-routing sub-tasks (summarization, post-processing) — not this milestone.
- **TTS provider swap to Cartesia/Deepgram/Inworld.** User decision: keep ElevenLabs British voice character.
- **Whisper-on-device replacement of Groq STT.** Groq Whisper is fast enough (~80ms) once Phase 12 stops sending it ambient noise.
- **Multi-user / SaaS readiness work.** Personal app remains single-user; row-scoping by `userId` from Phase 1 is sufficient.
- **iOS / mobile shell.** Desktop only (macOS) in Phase 14.
