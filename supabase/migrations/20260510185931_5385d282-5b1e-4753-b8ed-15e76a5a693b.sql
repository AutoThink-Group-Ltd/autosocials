
-- Risk level + status enums
DO $$ BEGIN
  CREATE TYPE public.agent_action_risk AS ENUM ('low','medium','high','destructive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_action_status AS ENUM ('pending','approved','rejected','executed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Approval queue
CREATE TABLE IF NOT EXISTS public.pending_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  intent text NOT NULL,
  label text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level public.agent_action_risk NOT NULL DEFAULT 'high',
  confirmation_message text,
  status public.agent_action_status NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  resolved_by uuid,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_user_status
  ON public.pending_agent_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_workspace
  ON public.pending_agent_actions(workspace_id);

ALTER TABLE public.pending_agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their pending actions"
  ON public.pending_agent_actions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  );

CREATE POLICY "Users create their own pending actions"
  ON public.pending_agent_actions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own pending actions"
  ON public.pending_agent_actions
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), workspace_id))
  );

CREATE TRIGGER trg_pending_actions_updated_at
  BEFORE UPDATE ON public.pending_agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log
CREATE TABLE IF NOT EXISTS public.agent_action_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  intent text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level public.agent_action_risk NOT NULL DEFAULT 'low',
  outcome text NOT NULL,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traces_user_created
  ON public.agent_action_traces(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_workspace_created
  ON public.agent_action_traces(workspace_id, created_at DESC);

ALTER TABLE public.agent_action_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their workspace traces"
  ON public.agent_action_traces
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (workspace_id IS NOT NULL AND public.is_workspace_member(auth.uid(), workspace_id))
  );

CREATE POLICY "Users insert their own traces"
  ON public.agent_action_traces
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
