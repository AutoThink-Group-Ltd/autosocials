CREATE OR REPLACE FUNCTION public.can_access_workspace(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_workspace_member(_user_id, _workspace_id) OR public.is_workspace_agency(_user_id, _workspace_id);
$$;

CREATE TABLE public.asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.asset_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asset_folders_ws ON public.asset_folders(workspace_id, parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_folders TO authenticated;
GRANT ALL ON public.asset_folders TO service_role;
ALTER TABLE public.asset_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders access" ON public.asset_folders FOR ALL TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));

CREATE TABLE public.brand_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.asset_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  mime text,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  source text NOT NULL DEFAULT 'upload',
  ai_label text,
  ai_summary text,
  extracted_text text,
  labelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_files_ws ON public.brand_files(workspace_id, folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_files TO authenticated;
GRANT ALL ON public.brand_files TO service_role;
ALTER TABLE public.brand_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files access" ON public.brand_files FOR ALL TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
CREATE TRIGGER brand_files_updated BEFORE UPDATE ON public.brand_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.brand_profiles (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  strength integer NOT NULL DEFAULT 0,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_profiles TO authenticated;
GRANT ALL ON public.brand_profiles TO service_role;
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile access" ON public.brand_profiles FOR ALL TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));

CREATE POLICY "brand private read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-assets-private' AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "brand private insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-assets-private' AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "brand private delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brand-assets-private' AND public.can_access_workspace(auth.uid(), ((storage.foldername(name))[1])::uuid));