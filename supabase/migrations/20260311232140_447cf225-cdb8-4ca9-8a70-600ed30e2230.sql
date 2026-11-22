
-- Create cancellation_events table for churn tracking
CREATE TABLE public.cancellation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  reason TEXT,
  details TEXT,
  plan_key TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cancellation_events ENABLE ROW LEVEL SECURITY;

-- RLS: workspace members can view cancellation events for their workspace
CREATE POLICY "Workspace members can view cancellation events"
ON public.cancellation_events
FOR SELECT
TO authenticated
USING (
  public.is_workspace_member(auth.uid(), workspace_id)
);

-- RLS: authenticated users can insert their own cancellation events
CREATE POLICY "Users can insert own cancellation events"
ON public.cancellation_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Add workspace-scoped RLS policy for workspace_subscriptions SELECT
-- (the table already exists, just ensuring proper RLS)
CREATE POLICY "Workspace members can view subscriptions"
ON public.workspace_subscriptions
FOR SELECT
TO authenticated
USING (
  public.is_workspace_member(auth.uid(), workspace_id)
);

CREATE POLICY "Workspace owners can update subscriptions"
ON public.workspace_subscriptions
FOR UPDATE
TO authenticated
USING (
  public.is_workspace_owner(auth.uid(), workspace_id)
);

CREATE POLICY "Workspace owners can insert subscriptions"
ON public.workspace_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_owner(auth.uid(), workspace_id)
);
