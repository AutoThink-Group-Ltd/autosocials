ALTER TABLE public.linkedin_oauth_states
  ADD COLUMN account_kind text NOT NULL DEFAULT 'profile'
  CHECK (account_kind IN ('profile', 'company'));

CREATE TABLE public.linkedin_pending_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pages jsonb NOT NULL CHECK (jsonb_typeof(pages) = 'array'),
  encrypted_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
ALTER TABLE public.linkedin_pending_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linkedin_pending_pages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.linkedin_pending_pages TO service_role;
CREATE INDEX linkedin_pending_pages_expiry ON public.linkedin_pending_pages (expires_at);

CREATE FUNCTION public.connect_linkedin_company_page(
  p_pending_id uuid, p_workspace_id uuid, p_user_id uuid, p_page_id text, p_token text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE pending public.linkedin_pending_pages%ROWTYPE; page jsonb;
BEGIN
  SELECT * INTO pending FROM public.linkedin_pending_pages
    WHERE id=p_pending_id AND workspace_id=p_workspace_id AND user_id=p_user_id
    AND expires_at>now() AND token_expires_at>now() FOR UPDATE;
  IF NOT FOUND OR p_page_id !~ '^[0-9]+$' OR p_token NOT LIKE 'linkedin:v1:%' THEN RETURN NULL; END IF;
  SELECT value INTO page FROM jsonb_array_elements(pending.pages)
    WHERE value ->> 'id' = p_page_id LIMIT 1;
  IF page IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.social_accounts
    (workspace_id,platform,external_id,display_name,handle,access_token,refresh_token,scopes,
    expires_at,token_encrypted_at,status,is_enabled,connected_by,metadata,last_error)
  VALUES
    (p_workspace_id,'linkedin','organization:' || p_page_id,page->>'name',page->>'vanity',
     p_token,NULL,ARRAY['rw_organization_admin','w_organization_social'],
     pending.token_expires_at,now(),'connected',true,p_user_id,'{"account_kind":"company"}',NULL)
  ON CONFLICT (workspace_id,platform,external_id) DO UPDATE SET
    display_name=excluded.display_name,handle=excluded.handle,access_token=excluded.access_token,
    refresh_token=NULL,scopes=excluded.scopes,expires_at=excluded.expires_at,token_encrypted_at=now(),
    status='connected',is_enabled=true,connected_by=excluded.connected_by,metadata=excluded.metadata,last_error=NULL;
  DELETE FROM public.linkedin_pending_pages WHERE id=p_pending_id;
  RETURN page->>'name';
END $$;
REVOKE ALL ON FUNCTION public.connect_linkedin_company_page(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_linkedin_company_page(uuid,uuid,uuid,text,text) TO service_role;
