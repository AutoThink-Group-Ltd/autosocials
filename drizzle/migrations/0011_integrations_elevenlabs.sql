CREATE TABLE public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','workspace')),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  last4 text NOT NULL,
  verified_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_credentials_uniq ON public.integration_credentials (provider, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  workspace_id uuid,
  action text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_voice_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'elevenlabs',
  brand_voice_id text,
  brand_voice_name text,
  allowed jsonb NOT NULL DEFAULT '[]'::jsonb,
  use_own_key boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_voice_settings TO authenticated;
GRANT ALL ON public.workspace_voice_settings TO service_role;
ALTER TABLE public.workspace_voice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice read" ON public.workspace_voice_settings FOR SELECT TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id));