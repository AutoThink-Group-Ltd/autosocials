-- Serialize reconnect with refresh claims on the social account row.
CREATE OR REPLACE FUNCTION public.save_x_oauth_account(_account jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE account_id uuid;
BEGIN
  INSERT INTO public.social_accounts (workspace_id, platform, external_id, handle, display_name, avatar_url,
    access_token, refresh_token, scopes, expires_at, token_encrypted_at, status, is_enabled, last_error, connected_by, metadata)
  VALUES ((_account->>'workspace_id')::uuid, 'x', _account->>'external_id', _account->>'handle', _account->>'display_name', _account->>'avatar_url',
    _account->>'access_token', _account->>'refresh_token', ARRAY(SELECT jsonb_array_elements_text(_account->'scopes')),
    (_account->>'expires_at')::timestamptz, now(), 'connected', true, NULL, (_account->>'connected_by')::uuid, '{}'::jsonb)
  ON CONFLICT (workspace_id, platform, external_id) DO UPDATE SET
    handle=EXCLUDED.handle, display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url,
    access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, scopes=EXCLUDED.scopes,
    expires_at=EXCLUDED.expires_at, token_encrypted_at=EXCLUDED.token_encrypted_at, status='connected',
    is_enabled=true, last_error=NULL, connected_by=EXCLUDED.connected_by, metadata='{}'::jsonb
  RETURNING id INTO account_id;
  DELETE FROM public.x_refresh_locks WHERE social_account_id=account_id;
END $$;
REVOKE ALL ON FUNCTION public.save_x_oauth_account(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_x_oauth_account(jsonb) TO service_role;
