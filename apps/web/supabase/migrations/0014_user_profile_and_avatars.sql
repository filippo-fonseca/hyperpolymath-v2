-- 0014 — user profile fields + avatars storage bucket.
--
-- Three additive columns on public.users (display_name, bio, avatar_url) plus
-- a new "avatars" Supabase Storage bucket with row-level security so users
-- can only mutate objects under their own userId prefix. Reads are public so
-- the sidebar / header can render avatars without a signed URL round-trip.
--
-- Matches drizzle output in drizzle/0009_slippery_true_believers.sql for the
-- columns; the bucket + policies live only in supabase/migrations because
-- drizzle does not introspect the storage schema.

-- ── Profile columns ───────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ── Avatars storage bucket ────────────────────────────────────────────────
-- public=true so avatar URLs are stable + cacheable without signed-URL ops.
-- The bucket is created idempotently so re-running the migration is safe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS — owner-scoped writes, public reads ──────────────────────
-- Convention: object name MUST be `${auth.uid()}/${filename}` so the first
-- path segment identifies the owner. The policy enforces this via
-- `(storage.foldername(name))[1] = auth.uid()::text` so a signed-in user can
-- only create / mutate / delete objects nested under their own user id.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
