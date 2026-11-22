
ALTER TABLE public.creator_profiles
ADD COLUMN IF NOT EXISTS contact_email text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS contact_source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS website_url text DEFAULT NULL;

COMMENT ON COLUMN public.creator_profiles.contact_email IS 'Verified business/contact email for outreach';
COMMENT ON COLUMN public.creator_profiles.contact_source IS 'Where the email was found: bio, website, linktree, youtube, graph_api';
COMMENT ON COLUMN public.creator_profiles.website_url IS 'Creator personal website or Linktree URL';
