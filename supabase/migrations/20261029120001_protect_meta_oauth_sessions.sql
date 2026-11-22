-- OAuth secrets are accessed only by the authenticated Edge Functions via service_role.
-- Browser selection uses meta-import-pages action=list, returning explicit safe fields.
REVOKE ALL ON TABLE public.meta_oauth_pending FROM anon, authenticated;
REVOKE ALL ON TABLE public.oauth_states FROM anon, authenticated;

-- Existing UI queries name safe columns; never grant browser access to provider credentials.
REVOKE SELECT, INSERT, UPDATE ON TABLE public.social_accounts FROM anon, authenticated;
GRANT SELECT (id, workspace_id, platform, external_id, handle, display_name, avatar_url,
  scopes, expires_at, status, last_error, metadata, connected_by, created_at, updated_at, is_enabled)
  ON public.social_accounts TO authenticated;
GRANT UPDATE (is_enabled) ON public.social_accounts TO authenticated;
