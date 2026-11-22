-- Restore private brand asset access after the Supabase migration.
-- Upload paths start with the owning workspace UUID: <workspace_id>/<asset_id>/<file>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets-private', 'brand-assets-private', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Workspace access can read brand assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets-private'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Workspace access can upload brand assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets-private'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Workspace access can update brand assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-assets-private'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'brand-assets-private'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Workspace access can delete brand assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-assets-private'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
