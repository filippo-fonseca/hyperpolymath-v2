-- 0018 — Phase 9 / TEL-01 — owner-only UPDATE policy on jarvis_events.
--
-- Plan 0009 deliberately omitted UPDATE because Phase 5 telemetry was
-- write-once (one INSERT per turn, no post-hoc edits). Phase 9 adds an
-- in-browser beacon (POST /api/jarvis/telemetry/voice-stages) that
-- back-fills 3 voice-pipeline timestamps (vad_end_at, tts_first_byte_at,
-- audio_first_play_at) AFTER the row was INSERTed by the /api/jarvis
-- handler. The beacon needs UPDATE.
--
-- Policy scope:
--   - SELECT: existing owner-only policy (0009) unchanged.
--   - INSERT: existing owner-only policy (0009) unchanged.
--   - UPDATE: NEW — owner-only. WHERE user_id = auth.uid().
--     RLS is row-level (not column-level) — but the application-layer
--     beacon endpoint constrains setPayload to exactly 3 columns
--     (vadEndAt / ttsFirstByteAt / audioFirstPlayAt) via Zod allow-list,
--     so a model-emitted or browser-spoofed payload can't, say, blank
--     out promptBuiltAt. Application-layer defense is sufficient for
--     single-user MVP.
--   - DELETE: still no policy — telemetry remains undeletable through the
--     authenticated role. Admin cleanup goes through service_role.
--
-- Defense-in-depth: the API route also constrains UPDATE to
-- WHERE id = $turnId AND user_id = claims.sub, so RLS is the second
-- guard. A model-emitted or browser-spoofed turn_id belonging to
-- another user fails both layers.

CREATE POLICY "jarvis_events_owner_update" ON public.jarvis_events
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
