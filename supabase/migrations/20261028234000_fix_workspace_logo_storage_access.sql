-- Allow workspace owners and linked agency accounts to upload or overwrite
-- only the logo files inside workspaces they manage. SELECT is required by
-- Supabase Storage when upload() uses upsert: true.
-- The helper already exists in production, but fresh preview databases must
-- create it before these policies reference it.
CREATE OR REPLACE FUNCTION public.can_manage_workspace_logo(_user_id uuid, _folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE wid uuid;
BEGIN
  BEGIN wid := _folder::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.is_workspace_owner(_user_id, wid) OR public.is_workspace_agency(_user_id, wid);
END $function$;

CREATE POLICY "Workspace managers read logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'workspace-logos'
    AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Workspace managers upload logos" ON storage.objects;
CREATE POLICY "Workspace managers upload logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'workspace-logos'
    AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Workspace managers update logos" ON storage.objects;
CREATE POLICY "Workspace managers update logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'workspace-logos'
    AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'workspace-logos'
    AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));
