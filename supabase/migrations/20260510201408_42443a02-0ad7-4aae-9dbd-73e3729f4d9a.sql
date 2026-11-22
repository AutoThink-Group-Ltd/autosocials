
-- Social accounts table
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok')),
  external_id text NOT NULL,
  handle text,
  display_name text,
  avatar_url text,
  access_token text NOT NULL,
  refresh_token text,
  scopes text[] DEFAULT '{}',
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','error','disconnected')),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_workspace ON public.social_accounts(workspace_id);

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view social accounts"
  ON public.social_accounts FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can insert social accounts"
  ON public.social_accounts FOR INSERT TO authenticated
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can update social accounts"
  ON public.social_accounts FOR UPDATE TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can delete social accounts"
  ON public.social_accounts FOR DELETE TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id));

CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Short-lived oauth state tokens
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  platform text NOT NULL,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON public.oauth_states(user_id);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own oauth states"
  ON public.oauth_states FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
