
-- Commission settings: workspace-level default commission config
CREATE TABLE public.commission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  commission_type text NOT NULL DEFAULT 'percentage',
  default_percentage numeric DEFAULT 15,
  default_flat_fee numeric DEFAULT 0,
  currency text DEFAULT 'USD',
  enable_tiers boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view commission settings"
  ON public.commission_settings FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage commission settings"
  ON public.commission_settings FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- Commission tiers: follower-count-based tiers
CREATE TABLE public.commission_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  min_followers integer NOT NULL DEFAULT 0,
  max_followers integer,
  commission_type text NOT NULL DEFAULT 'percentage',
  percentage numeric DEFAULT 0,
  flat_fee numeric DEFAULT 0,
  label text,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view commission tiers"
  ON public.commission_tiers FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage commission tiers"
  ON public.commission_tiers FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- Commission exclusion/override rules
CREATE TABLE public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rule_type text NOT NULL DEFAULT 'niche',
  match_value text NOT NULL,
  action text NOT NULL DEFAULT 'override',
  override_type text DEFAULT 'percentage',
  override_percentage numeric DEFAULT 0,
  override_flat_fee numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view commission rules"
  ON public.commission_rules FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage commission rules"
  ON public.commission_rules FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));
