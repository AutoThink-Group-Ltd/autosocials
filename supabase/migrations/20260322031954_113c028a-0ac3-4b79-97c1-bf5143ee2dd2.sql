
CREATE TABLE public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_sender_identity BOOLEAN DEFAULT false,

  -- Outreach mode toggles
  bcc_on_campaigns BOOLEAN DEFAULT false,
  bcc_on_follow_ups BOOLEAN DEFAULT false,
  bcc_on_clicks BOOLEAN DEFAULT false,
  bcc_on_replies BOOLEAN DEFAULT false,
  bcc_on_bounces BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(workspace_id, email)
);

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view notification recipients"
  ON public.notification_recipients FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage notification recipients"
  ON public.notification_recipients FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));
