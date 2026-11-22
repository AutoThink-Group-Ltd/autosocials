CREATE TABLE public.vibe_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text DEFAULT 'New conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vibe_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view vibe conversations"
  ON public.vibe_conversations FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can insert vibe conversations"
  ON public.vibe_conversations FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can update vibe conversations"
  ON public.vibe_conversations FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete vibe conversations"
  ON public.vibe_conversations FOR DELETE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));