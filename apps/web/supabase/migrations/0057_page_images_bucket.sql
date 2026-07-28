-- 0057 — page-images storage bucket for wiki page image uploads.
--
-- Mirror of drizzle/0040_page_images_bucket.sql. Issue #349 (jul-28 U2):
-- drag-drop, clipboard paste, and the `/` slash menu's Image item all upload
-- here through BlockNote's `uploadFile` seam.
--
-- Same shape as the avatars bucket in 0014_user_profile_and_avatars.sql:
-- public reads so a page's <img> renders without a signed-URL round-trip,
-- owner-scoped writes keyed on the first path segment.

-- ── Bucket ────────────────────────────────────────────────────────────────
-- public=true so image URLs are stable + cacheable. Created idempotently so
-- re-running the migration is safe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-images',
  'page-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS — owner-scoped writes, public reads ──────────────────────
-- Convention: object name MUST be `${auth.uid()}/${pageId}/${uuid}.${ext}` so
-- the first path segment identifies the owner. The policies enforce this via
-- `(storage.foldername(name))[1] = auth.uid()::text`.

DROP POLICY IF EXISTS "page_images_public_read" ON storage.objects;
CREATE POLICY "page_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'page-images');

DROP POLICY IF EXISTS "page_images_owner_insert" ON storage.objects;
CREATE POLICY "page_images_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "page_images_owner_update" ON storage.objects;
CREATE POLICY "page_images_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "page_images_owner_delete" ON storage.objects;
CREATE POLICY "page_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
