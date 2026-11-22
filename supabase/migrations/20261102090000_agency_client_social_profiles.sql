ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.agency_clients
  ADD CONSTRAINT agency_clients_social_profiles_array
  CHECK (jsonb_typeof(social_profiles) = 'array');
