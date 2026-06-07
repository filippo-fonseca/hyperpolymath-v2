-- 0017 — jarvis_events per-stage latency timestamps (Phase 9 / TEL-01).
--
-- Adds 8 nullable timestamptz columns capturing each stage of the JARVIS
-- voice-end-to-audio-out pipeline. Populated by Phase 9 capture sites
-- across /api/jarvis, /api/jarvis/stt, the JarvisListener client, the
-- useTtsPlayer hook, and the AudioQueue. All columns nullable because:
--
--   - LLM-stage columns (prompt_built_at, first_token_at, last_token_at,
--     tool_loop_done_at) populate on every turn, but a stream that errors
--     pre-first-token leaves later columns null.
--   - Voice-pipeline columns (vad_end_at, stt_done_at, tts_first_byte_at,
--     audio_first_play_at) populate only when voice_active=true.
--
-- Additive only. Existing rows + write paths are untouched. Derived
-- *_ms deltas are computed in the query layer (D-01) — not stored.

ALTER TABLE public.jarvis_events
  ADD COLUMN IF NOT EXISTS vad_end_at         timestamptz,
  ADD COLUMN IF NOT EXISTS stt_done_at        timestamptz,
  ADD COLUMN IF NOT EXISTS prompt_built_at    timestamptz,
  ADD COLUMN IF NOT EXISTS first_token_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_token_at      timestamptz,
  ADD COLUMN IF NOT EXISTS tool_loop_done_at  timestamptz,
  ADD COLUMN IF NOT EXISTS tts_first_byte_at  timestamptz,
  ADD COLUMN IF NOT EXISTS audio_first_play_at timestamptz;
