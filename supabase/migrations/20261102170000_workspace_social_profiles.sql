ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_social_profiles_array
  CHECK (jsonb_typeof(social_profiles) = 'array');

UPDATE public.workspaces AS workspace
SET social_profiles = client.social_profiles
FROM public.agency_clients AS client
WHERE client.workspace_id = workspace.id
  AND workspace.social_profiles = '[]'::jsonb
  AND client.social_profiles <> '[]'::jsonb;
