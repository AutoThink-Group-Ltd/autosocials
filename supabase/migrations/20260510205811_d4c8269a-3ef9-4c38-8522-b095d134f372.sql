ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS agent_run_id uuid,
  ADD COLUMN IF NOT EXISTS created_via text;

CREATE TABLE IF NOT EXISTS public.post_agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  agent_run_id uuid,
  skill text,
  tool text,
  event_type text NOT NULL,
  payload jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_agent_events_post_id ON public.post_agent_events(post_id);
CREATE INDEX IF NOT EXISTS idx_post_agent_events_workspace ON public.post_agent_events(workspace_id);

ALTER TABLE public.post_agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read post agent events"
  ON public.post_agent_events
  FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));