ALTER TABLE public.social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_platform_check CHECK (platform IN ('facebook','instagram','tiktok','youtube','x'));

CREATE TABLE public.x_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  verifier text NOT NULL,
  redirect_to text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
ALTER TABLE public.x_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.x_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.x_oauth_states TO service_role;
