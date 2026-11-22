
-- 1. Create agency_usage_tracking table
CREATE TABLE public.agency_usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  emails_sent integer NOT NULL DEFAULT 0,
  leads_count integer NOT NULL DEFAULT 0,
  campaigns_active integer NOT NULL DEFAULT 0,
  discoveries_run integer NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their usage tracking"
  ON public.agency_usage_tracking
  FOR ALL
  TO authenticated
  USING (agency_user_id = auth.uid())
  WITH CHECK (agency_user_id = auth.uid());

-- 2. Add courtesy_plan_key and courtesy_plan_expires_at to workspace_subscriptions
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS courtesy_plan_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS courtesy_plan_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS courtesy_granted_by uuid DEFAULT NULL;

-- 3. Add missing notification preference columns to agency_notification_preferences
ALTER TABLE public.agency_notification_preferences
  ADD COLUMN IF NOT EXISTS bcc_on_dm_autopilot boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bcc_on_dm_autopilot_notifications boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bcc_on_dm_clicks boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_campaigns boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_follow_ups boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_replies boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_bounces boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_clicks boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_autopilot boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mktg_on_autopilot_notifications boolean DEFAULT false;
