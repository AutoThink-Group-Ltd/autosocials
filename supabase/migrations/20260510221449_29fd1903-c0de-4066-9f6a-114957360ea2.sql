CREATE TABLE IF NOT EXISTS public.meta_oauth_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_access_token text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_oauth_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view their pending meta picks"
ON public.meta_oauth_pending FOR SELECT
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete their pending meta picks"
ON public.meta_oauth_pending FOR DELETE
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS idx_meta_oauth_pending_workspace ON public.meta_oauth_pending(workspace_id);