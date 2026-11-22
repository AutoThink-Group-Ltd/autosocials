-- Restore the private post-media access rules required by the Publish composer.
-- Media paths start with the owning workspace ID.
DROP POLICY IF EXISTS "Members can read post-media" ON storage.objects;
CREATE POLICY "Members can read post-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Members can upload post-media" ON storage.objects;
CREATE POLICY "Members can upload post-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Members can update post-media" ON storage.objects;
CREATE POLICY "Members can update post-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Members can delete post-media" ON storage.objects;
CREATE POLICY "Members can delete post-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
