
CREATE TABLE public.dossier_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'paste' CHECK (source IN ('paste','upload')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dossier_documents_workspace ON public.dossier_documents(workspace_id);

ALTER TABLE public.dossier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view dossier"
  ON public.dossier_documents FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can insert dossier"
  ON public.dossier_documents FOR INSERT
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can update dossier"
  ON public.dossier_documents FOR UPDATE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete dossier"
  ON public.dossier_documents FOR DELETE
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER update_dossier_documents_updated_at
  BEFORE UPDATE ON public.dossier_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
