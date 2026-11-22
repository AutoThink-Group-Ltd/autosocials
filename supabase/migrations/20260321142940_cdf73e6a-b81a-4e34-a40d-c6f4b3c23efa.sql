
-- 1. workspace_sendgrid_config: subuser credentials per workspace
CREATE TABLE public.workspace_sendgrid_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subuser_username text NOT NULL UNIQUE,
  subuser_id integer,
  api_key text NOT NULL,
  ip_pool text NOT NULL DEFAULT 'as_outreach_pool',
  warmup_stage text NOT NULL DEFAULT 'onboarding',
  total_sends_lifetime integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.workspace_sendgrid_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view sendgrid config"
  ON public.workspace_sendgrid_config FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage sendgrid config"
  ON public.workspace_sendgrid_config FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- 2. workspace_domains: domain authentication records
CREATE TABLE public.workspace_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  sendgrid_domain_id integer,
  status text NOT NULL DEFAULT 'pending',
  dns_records jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

ALTER TABLE public.workspace_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view domains"
  ON public.workspace_domains FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage domains"
  ON public.workspace_domains FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- 3. sender_identities: verified sender addresses
CREATE TABLE public.sender_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  contact_name text,
  is_default boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, sender_email)
);

ALTER TABLE public.sender_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view sender identities"
  ON public.sender_identities FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage sender identities"
  ON public.sender_identities FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- 4. email_signatures: reusable email signatures
CREATE TABLE public.email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  html_content text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  sender_identity_id uuid REFERENCES public.sender_identities(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view signatures"
  ON public.email_signatures FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage signatures"
  ON public.email_signatures FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- 5. email_send_log: outgoing email tracking
CREATE TABLE public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_identity_id uuid REFERENCES public.sender_identities(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text,
  message_id text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view email logs"
  ON public.email_send_log FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can insert email logs"
  ON public.email_send_log FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

-- 6. email_replies: inbound reply tracking
CREATE TABLE public.email_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  original_message_id text,
  from_email text NOT NULL,
  from_name text,
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view replies"
  ON public.email_replies FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Service can insert replies"
  ON public.email_replies FOR INSERT TO authenticated
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
