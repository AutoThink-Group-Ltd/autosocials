
-- 1. Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_onboarding_data JSONB,
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS primary_workspace_id UUID,
  ADD COLUMN IF NOT EXISTS starred_workspace_ids UUID[] DEFAULT '{}';

-- 2. Create workspaces table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  website TEXT,
  phone TEXT,
  address TEXT,
  booking_link TEXT,
  business_model TEXT,
  software_name TEXT,
  software_url TEXT,
  contact_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 3. Create workspace_members table
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- 4. Create workspace_subscriptions table
CREATE TABLE public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan_key TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'incomplete',
  has_managed_service BOOLEAN DEFAULT false,
  billing_period TEXT,
  currency TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- 5. Security definer function to check workspace membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND workspace_id = _workspace_id AND role = 'owner'
  )
$$;

-- 6. RLS policies for workspaces
CREATE POLICY "Members can view their workspaces"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), id));

CREATE POLICY "Owners can update their workspaces"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.is_workspace_owner(auth.uid(), id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), id));

CREATE POLICY "Authenticated users can create workspaces"
  ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can delete workspaces"
  ON public.workspaces FOR DELETE TO authenticated
  USING (public.is_workspace_owner(auth.uid(), id));

-- 7. RLS policies for workspace_members
CREATE POLICY "Members can view workspace members"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can insert their own membership"
  ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Owners can update members"
  ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete members"
  ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id) OR user_id = auth.uid());

-- 8. RLS policies for workspace_subscriptions
CREATE POLICY "Members can view workspace subscriptions"
  ON public.workspace_subscriptions FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Owners can manage subscriptions"
  ON public.workspace_subscriptions FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

-- Add FK from profiles to workspaces
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  ADD CONSTRAINT profiles_primary_workspace_id_fkey FOREIGN KEY (primary_workspace_id) REFERENCES public.workspaces(id);

-- 9. Agency profiles table
CREATE TABLE public.agency_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  agency_name TEXT NOT NULL,
  agency_logo_url TEXT,
  agency_website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  booking_url TEXT,
  referral_code TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  commission_rate NUMERIC DEFAULT 20,
  notes TEXT,
  payout_method TEXT,
  payout_email TEXT,
  paypal_email TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  bank_iban TEXT,
  notify_on_report_views BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agency profile"
  ON public.agency_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own agency profile"
  ON public.agency_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own agency profile"
  ON public.agency_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 10. Agency clients table
CREATE TABLE public.agency_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  client_name TEXT NOT NULL,
  client_user_id UUID,
  client_contact_name TEXT,
  client_contact_email TEXT,
  status TEXT DEFAULT 'active',
  subscription_plan_key TEXT,
  monthly_fee NUMERIC,
  commission_rate NUMERIC,
  billing_notes TEXT,
  onboarded_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  disconnected_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their clients"
  ON public.agency_clients FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 11. Agency client invitations
CREATE TABLE public.agency_client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  email TEXT NOT NULL,
  contact_name TEXT,
  client_company_name TEXT,
  token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  status TEXT DEFAULT 'pending',
  role TEXT DEFAULT 'client',
  invitation_type TEXT DEFAULT 'client',
  permissions JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  client_user_id UUID,
  link_opened_count INTEGER DEFAULT 0,
  link_last_opened_at TIMESTAMPTZ,
  notifications_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_client_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their invitations"
  ON public.agency_client_invitations FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 12. Agency client links
CREATE TABLE public.agency_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  agency_client_id UUID REFERENCES public.agency_clients(id),
  status TEXT DEFAULT 'active',
  connected_at TIMESTAMPTZ DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_client_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their links"
  ON public.agency_client_links FOR ALL TO authenticated
  USING (agency_user_id = auth.uid() OR client_user_id = auth.uid())
  WITH CHECK (agency_user_id = auth.uid());

-- 13. Agency employee invitations
CREATE TABLE public.agency_employee_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'employee',
  client_access TEXT DEFAULT 'all',
  client_ids UUID[],
  token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID,
  link_opened_count INTEGER DEFAULT 0,
  link_last_opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_employee_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage employee invitations"
  ON public.agency_employee_invitations FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 14. Agency employees
CREATE TABLE public.agency_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  employee_user_id UUID NOT NULL,
  invitation_id UUID REFERENCES public.agency_employee_invitations(id),
  full_name TEXT,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'employee',
  client_access TEXT DEFAULT 'all',
  client_ids UUID[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their employees"
  ON public.agency_employees FOR ALL TO authenticated
  USING (agency_user_id = auth.uid() OR employee_user_id = auth.uid())
  WITH CHECK (agency_user_id = auth.uid());

-- 15. Agency activity log
CREATE TABLE public.agency_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  client_name TEXT,
  action_type TEXT NOT NULL,
  action_label TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view their activity"
  ON public.agency_activity_log FOR SELECT TO authenticated
  USING (agency_user_id = auth.uid() OR actor_user_id = auth.uid());
CREATE POLICY "Authenticated can insert activity"
  ON public.agency_activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- 16. Agency commissions
CREATE TABLE public.agency_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  agency_client_id UUID REFERENCES public.agency_clients(id),
  invoice_amount NUMERIC DEFAULT 0,
  commission_rate NUMERIC DEFAULT 20,
  commission_amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'gbp',
  invoice_date DATE DEFAULT now(),
  billing_period TEXT,
  plan_key TEXT,
  stripe_invoice_id TEXT,
  stripe_charge_id TEXT,
  subscription_status TEXT,
  trial_ends_at TIMESTAMPTZ,
  status TEXT DEFAULT 'upcoming',
  notes TEXT,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view their commissions"
  ON public.agency_commissions FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 17. Agency notification preferences
CREATE TABLE public.agency_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  client_workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  bcc_emails TEXT[] DEFAULT '{}',
  bcc_on_campaigns BOOLEAN DEFAULT false,
  bcc_on_autopilot BOOLEAN DEFAULT false,
  bcc_on_follow_ups BOOLEAN DEFAULT false,
  bcc_on_autopilot_notifications BOOLEAN DEFAULT false,
  bcc_on_clicks BOOLEAN DEFAULT false,
  bcc_on_replies BOOLEAN DEFAULT false,
  bcc_on_bounces BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their notification prefs"
  ON public.agency_notification_preferences FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 18. Agency todos
CREATE TABLE public.agency_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  client_id UUID REFERENCES public.agency_clients(id),
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their todos"
  ON public.agency_todos FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 19. Agency reports
CREATE TABLE public.agency_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  agency_client_id UUID REFERENCES public.agency_clients(id),
  title TEXT DEFAULT 'Performance Report',
  token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  campaign_ids UUID[],
  date_from DATE,
  date_to DATE,
  custom_message TEXT,
  sent_to TEXT[],
  cc_emails TEXT[],
  sent_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their reports"
  ON public.agency_reports FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 20. Agency referral links
CREATE TABLE public.agency_referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  agency_profile_id UUID REFERENCES public.agency_profiles(id) NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  click_count INTEGER DEFAULT 0,
  signup_count INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their referral links"
  ON public.agency_referral_links FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- 21. Agency referral clicks
CREATE TABLE public.agency_referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_profile_id UUID REFERENCES public.agency_profiles(id) NOT NULL,
  referral_link_id UUID REFERENCES public.agency_referral_links(id),
  referral_code TEXT NOT NULL,
  slug TEXT,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can view their referral clicks"
  ON public.agency_referral_clicks FOR SELECT TO authenticated
  USING (agency_profile_id IN (SELECT id FROM public.agency_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can insert referral clicks"
  ON public.agency_referral_clicks FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 22. Agency client digests
CREATE TABLE public.agency_client_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id UUID NOT NULL,
  agency_client_id UUID REFERENCES public.agency_clients(id) NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  additional_to_emails TEXT[] DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  bcc_emails TEXT[] DEFAULT '{}',
  schedule TEXT DEFAULT 'weekly',
  schedule_day INTEGER DEFAULT 1,
  schedule_hour INTEGER DEFAULT 9,
  is_enabled BOOLEAN DEFAULT true,
  include_campaign_breakdown BOOLEAN DEFAULT true,
  include_deliverability BOOLEAN DEFAULT true,
  custom_intro_text TEXT,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.agency_client_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency users can manage their digests"
  ON public.agency_client_digests FOR ALL TO authenticated
  USING (agency_user_id = auth.uid()) WITH CHECK (agency_user_id = auth.uid());

-- Update handle_new_user to include account_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct')
  );
  RETURN NEW;
END;
$$;
