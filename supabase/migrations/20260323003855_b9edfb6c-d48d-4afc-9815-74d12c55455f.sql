CREATE TABLE public.vibe_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  message TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  creator_types TEXT[] DEFAULT '{}',
  pro_tips TEXT[] DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vibe_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view vibe searches"
  ON public.vibe_searches FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can insert vibe searches"
  ON public.vibe_searches FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete vibe searches"
  ON public.vibe_searches FOR DELETE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));