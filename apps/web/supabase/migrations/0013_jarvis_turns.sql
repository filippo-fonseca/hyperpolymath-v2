-- Phase 7 polish — jarvis_turns persisted scrollback (BUG FIX 2026-05-25).
--
-- The Drizzle schema for `jarvis_turns` shipped earlier but the migration
-- itself was missed. As a result every saveJarvisTurn server action call
-- has been silently failing against a non-existent table for some time,
-- which is why the JARVIS Console never showed any history on reload.
-- This migration creates the table + indexes + RLS policies so persistence
-- starts working immediately. Idempotent (IF NOT EXISTS) so it's safe to
-- run against environments that may already have a partial state.
--
-- Columns mirror the client-side `ScrollbackTurn` union (see
-- apps/web/components/jarvis/jarvis-types.ts):
--   - `kind` discriminates user vs assistant
--   - `text` / `text_delta` are populated per kind (one or the other)
--   - `actions` + `clarification` are JSONB blobs that mirror the client
--     shapes verbatim — we don't normalize into separate tables because the
--     client treats them as opaque payloads attached to assistant turns
--   - `status` + `error_message` are assistant-only
--
-- RLS: owner-only SELECT / INSERT / UPDATE. UPDATE is needed because the
-- streaming-finalize and undo paths amend an existing assistant turn by id
-- (upsert pattern from the client — onConflictDoUpdate on the id PK).

CREATE TABLE IF NOT EXISTS public.jarvis_turns (
  id             uuid        PRIMARY KEY,           -- client-generated UUID (so streaming-finalize finds the row)
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind           text        NOT NULL CHECK (kind IN ('user', 'assistant')),
  text           text,                              -- user turn body; NULL for assistant
  text_delta     text,                              -- assistant prose; NULL for user
  actions        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  clarification  jsonb,
  status         text,                              -- 'streaming' | 'done' | 'error' (assistant only)
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Pagination index — every loadJarvisHistoryPage query filters on user_id
-- and orders/cursors by created_at, so a composite index covers both.
CREATE INDEX IF NOT EXISTS jarvis_turns_user_created_idx
  ON public.jarvis_turns (user_id, created_at);

ALTER TABLE public.jarvis_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jarvis_turns_owner_select" ON public.jarvis_turns
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_turns_owner_insert" ON public.jarvis_turns
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "jarvis_turns_owner_update" ON public.jarvis_turns
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- DELETE not needed for the current scrollback UX (no "delete a turn"
-- action). Add later if the user gains that ability.
