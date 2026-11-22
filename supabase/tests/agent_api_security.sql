-- Run only against an empty isolated PostgreSQL database.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/agent_api_security.sql <EMPTY_TEST_DATABASE>
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create table public.workspaces (id uuid primary key);
create table public.workspace_members (user_id uuid, workspace_id uuid, primary key(user_id, workspace_id));
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  created_by uuid not null,
  caption text not null,
  status text not null,
  created_via text
);
create function public.can_access_workspace(p_user uuid, p_workspace uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.workspace_members where user_id = p_user and workspace_id = p_workspace);
$$;

\ir ../migrations/20261122154651_agent_api_core.sql

do $$
declare
  owner_id uuid := gen_random_uuid();
  workspace uuid := gen_random_uuid();
  other_workspace uuid := gen_random_uuid();
  oauth_request uuid;
  connection uuid;
  original_draft uuid;
  token jsonb;
  callback constant text := 'https://client.example.invalid/callback';
  audience constant text := 'https://pilot.example.invalid/mcp';
begin
  insert into auth.users values (owner_id);
  insert into public.workspaces values (workspace), (other_workspace);
  insert into public.workspace_members values (owner_id, workspace);
  insert into public.agent_api_oauth_clients (id, label, redirect_uris, auth_method)
    values ('synthetic-client', 'Fixture', array[callback], 'none');
  insert into public.agent_api_oauth_requests (client_id, redirect_uri, resource, state, challenge, scopes)
    values ('synthetic-client', callback, audience, 'state', 'challenge', array['channels:read','drafts:write'])
    returning id into oauth_request;

  if public.authorize_agent_api_request(oauth_request, owner_id, other_workspace, 'synthetic-code', true) then
    raise exception 'Cross-workspace OAuth grant succeeded';
  end if;
  if not public.authorize_agent_api_request(oauth_request, owner_id, workspace, 'synthetic-code', true)
    or public.authorize_agent_api_request(oauth_request, owner_id, workspace, 'second-code', true) then
    raise exception 'OAuth consent was not single-use';
  end if;
  select id into connection from public.agent_api_connections where user_id = owner_id;
  if public.exchange_agent_api_token('authorization_code', 'synthetic-code', 'synthetic-client', audience, callback,
    'wrong-challenge', 'wrong-access', 'wrong-refresh', null) is not null then
    raise exception 'Incorrect PKCE challenge exchanged a code';
  end if;
  if public.exchange_agent_api_token('authorization_code', 'synthetic-code', 'synthetic-client', 'other-resource', callback,
    'challenge', 'wrong-access', 'wrong-refresh', null) is not null then
    raise exception 'Different audience exchanged a code';
  end if;
  token := public.exchange_agent_api_token('authorization_code', 'synthetic-code', 'synthetic-client', audience, callback,
    'challenge', 'first-access', 'first-refresh', array['drafts:write','channels:read']);
  if token is null or (token->>'expiresIn')::integer <> 3600 then
    raise exception 'Valid OAuth exchange did not issue bounded tokens';
  end if;
  if public.exchange_agent_api_token('authorization_code', 'synthetic-code', 'synthetic-client', audience, callback,
    'challenge', 'replayed-access', 'replayed-refresh', null) is not null then
    raise exception 'An authorization code could be replayed';
  end if;

  original_draft := public.create_agent_written_draft(connection, owner_id, workspace, 'Fixture text', 'draft-retry', 'body-1');
  if original_draft is null or public.create_agent_written_draft(connection, owner_id, workspace, 'Fixture text', 'draft-retry', 'body-1') <> original_draft
    or (select count(*) from public.posts) <> 1 then
    raise exception 'An exact draft retry created a duplicate';
  end if;
  begin
    perform public.create_agent_written_draft(connection, owner_id, workspace, 'Changed text', 'draft-retry', 'body-2');
    raise exception 'A changed draft reused the same key';
  exception when unique_violation then null;
  end;
  token := public.exchange_agent_api_token('refresh_token', 'first-refresh', 'synthetic-client', audience, '', '',
    'second-access', 'second-refresh', null);
  if token is null then raise exception 'Refresh did not rotate the token'; end if;
  token := public.exchange_agent_api_token('refresh_token', 'first-refresh', 'synthetic-client', audience, '', '',
    'replayed-access', 'replayed-refresh', null);
  if token is not null or (select revoked_at from public.agent_api_connections where id = connection) is null then
    raise exception 'Refresh replay did not revoke the connection';
  end if;
  if has_table_privilege('authenticated', 'public.agent_api_oauth_tokens', 'select')
    or has_function_privilege('anon', 'public.authorize_agent_api_request(uuid,uuid,uuid,text,boolean)', 'execute') then
    raise exception 'OAuth data or privileged query is externally reachable';
  end if;
  if not public.take_agent_api_rate_slot('fixture', 1) or public.take_agent_api_rate_slot('fixture', 1) then
    raise exception 'Rate window did not enforce its budget';
  end if;
end $$;
rollback;
