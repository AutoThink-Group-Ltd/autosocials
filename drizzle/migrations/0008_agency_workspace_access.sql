CREATE OR REPLACE FUNCTION public.is_workspace_agency(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agency_client_links
    WHERE agency_user_id = _user_id AND workspace_id = _workspace_id AND status = 'active');
$$;

CREATE POLICY "Agencies can view client workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_agency(auth.uid(), id));
CREATE POLICY "Agencies can update client workspaces" ON public.workspaces
  FOR UPDATE TO authenticated USING (public.is_workspace_agency(auth.uid(), id))
  WITH CHECK (public.is_workspace_agency(auth.uid(), id));

CREATE OR REPLACE FUNCTION public.can_manage_workspace_logo(_user_id uuid, _folder text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wid uuid;
BEGIN
  BEGIN wid := _folder::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN public.is_workspace_owner(_user_id, wid) OR public.is_workspace_agency(_user_id, wid);
END $$;

DROP POLICY IF EXISTS "Authenticated users can update their logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update workspace logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete workspace logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload workspace logos" ON storage.objects;

CREATE POLICY "Workspace managers upload logos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'workspace-logos' AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));
CREATE POLICY "Workspace managers update logos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'workspace-logos' AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));
CREATE POLICY "Workspace managers delete logos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'workspace-logos' AND public.can_manage_workspace_logo(auth.uid(), (storage.foldername(name))[1]));