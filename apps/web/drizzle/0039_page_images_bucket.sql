-- page-images — Supabase Storage bucket backing wiki page image uploads
-- (issue #349 / jul-28 U2). Drag-drop, clipboard paste, and the `/` slash
-- menu's Image item all upload here through BlockNote's `uploadFile` seam.
--
-- Mirrors the shape of the avatars bucket in
-- supabase/migrations/0014_user_profile_and_avatars.sql: public reads so the
-- <img> in a page renders without a signed-URL round-trip, owner-scoped
-- writes keyed on the first path segment.
--
-- Object path convention: `${userId}/${pageId}/${uuid}.${ext}`. The first
-- segment identifies the owner, which is what the RLS policies below check.
-- Paths are unique per upload, so the objects are immutable and need no
-- cache-buster on the public URL.
--
-- Storage lives outside drizzle's introspection, so this file is hand-written
-- rather than generated. Applied by hand, idempotently (journal stale).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-images',
  'page-images',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

DROP POLICY IF EXISTS "page_images_public_read" ON storage.objects;--> statement-breakpoint
CREATE POLICY "page_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'page-images');--> statement-breakpoint

DROP POLICY IF EXISTS "page_images_owner_insert" ON storage.objects;--> statement-breakpoint
CREATE POLICY "page_images_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );--> statement-breakpoint

DROP POLICY IF EXISTS "page_images_owner_update" ON storage.objects;--> statement-breakpoint
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
  );--> statement-breakpoint

DROP POLICY IF EXISTS "page_images_owner_delete" ON storage.objects;--> statement-breakpoint
CREATE POLICY "page_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'page-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
