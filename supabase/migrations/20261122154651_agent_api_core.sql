-- All agent credentials and audit rows are server-only.
create table public.agent_api_oauth_clients (
  id text primary key,
  label text not null,
  redirect_uris text[] not null,
  auth_method text not null check (auth_method in ('none', 'client_secret_basic', 'client_secret_post')),
  secret_hash text,
  created_at timestamptz not null default now(),
  check ((auth_method = 'none') = (secret_hash is null))
);

create table public.agent_api_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('api_key', 'oauth')),
  oauth_client_id text references public.agent_api_oauth_clients(id),
  key_hash text unique,
  key_prefix text,
  label text not null,
  scopes text[] not null check (cardinality(scopes) > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check ((kind = 'oauth') = (oauth_client_id is not null)),
  check ((kind = 'api_key') = (key_hash is not null and key_prefix is not null))
);
create index agent_api_connections_workspace_idx on public.agent_api_connections(workspace_id, created_at desc);
create index agent_api_connections_user_idx on public.agent_api_connections(user_id);
create index agent_api_connections_client_idx on public.agent_api_connections(oauth_client_id);

create table public.agent_api_oauth_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.agent_api_oauth_clients(id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  state text not null,
  challenge text not null,
  scopes text[] not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);
create index agent_api_oauth_requests_expiry_idx on public.agent_api_oauth_requests(expires_at);
create index agent_api_oauth_requests_client_idx on public.agent_api_oauth_requests(client_id);

create table public.agent_api_oauth_codes (
  secret_hash text primary key,
  connection_id uuid not null references public.agent_api_connections(id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  challenge text not null,
  expires_at timestamptz not null default (now() + interval '2 minutes')
);
create index agent_api_oauth_codes_connection_idx on public.agent_api_oauth_codes(connection_id);
create index agent_api_oauth_codes_expiry_idx on public.agent_api_oauth_codes(expires_at);

create table public.agent_api_oauth_tokens (
  secret_hash text primary key,
  connection_id uuid not null references public.agent_api_connections(id) on delete cascade,
  resource text not null,
  kind text not null check (kind in ('access', 'refresh')),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index agent_api_oauth_tokens_connection_idx on public.agent_api_oauth_tokens(connection_id);
create index agent_api_oauth_tokens_expiry_idx on public.agent_api_oauth_tokens(expires_at);

create table public.agent_api_rate_windows (
  bucket text not null,
  opened_at timestamptz not null,
  attempts int not null,
  primary key (bucket, opened_at)
);
create index agent_api_rate_windows_expiry_idx on public.agent_api_rate_windows(opened_at);

create table public.agent_api_requests (
  id uuid primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  connection_id uuid references public.agent_api_connections(id) on delete set null,
  operation text not null,
  transport text not null check (transport in ('rest', 'mcp')),
  occurred_at timestamptz not null default now(),
  outcome text not null default 'started',
  duration_ms int check (duration_ms >= 0),
  settled_credits numeric check (settled_credits >= 0)
);
create index agent_api_requests_workspace_idx on public.agent_api_requests(workspace_id, occurred_at desc);
create index agent_api_requests_connection_idx on public.agent_api_requests(connection_id, occurred_at desc);
create index agent_api_requests_time_idx on public.agent_api_requests(occurred_at desc);

alter table public.agent_api_oauth_clients enable row level security;
alter table public.agent_api_connections enable row level security;
alter table public.agent_api_oauth_requests enable row level security;
alter table public.agent_api_oauth_codes enable row level security;
alter table public.agent_api_oauth_tokens enable row level security;
alter table public.agent_api_rate_windows enable row level security;
alter table public.agent_api_requests enable row level security;

revoke all on public.agent_api_oauth_clients, public.agent_api_connections, public.agent_api_oauth_requests,
  public.agent_api_oauth_codes, public.agent_api_oauth_tokens, public.agent_api_rate_windows, public.agent_api_requests
  from public, anon, authenticated;
grant select, insert, update, delete on public.agent_api_oauth_clients, public.agent_api_connections,
  public.agent_api_oauth_requests, public.agent_api_oauth_codes, public.agent_api_oauth_tokens,
  public.agent_api_rate_windows, public.agent_api_requests to service_role;

create function public.take_agent_api_rate_slot(p_bucket text, p_limit int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count int;
begin
  insert into public.agent_api_rate_windows as rate (bucket, opened_at, attempts)
  values (p_bucket, v_window, 1)
  on conflict (bucket, opened_at) do update set attempts = rate.attempts + 1
  where rate.attempts < p_limit
  returning attempts into v_count;
  return v_count is not null;
end;
$$;

create function public.authorize_agent_api_request(
  p_request uuid, p_user uuid, p_workspace uuid, p_code_hash text, p_allow boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.agent_api_oauth_requests%rowtype;
  v_connection uuid;
begin
  if p_allow and not coalesce(public.can_access_workspace(p_user, p_workspace), false) then
    return false;
  end if;

  update public.agent_api_oauth_requests set consumed_at = now()
  where id = p_request and consumed_at is null and expires_at > now()
  returning * into v_request;
  if not found then
    return false;
  end if;
  if not p_allow then
    return true;
  end if;

  insert into public.agent_api_connections (workspace_id, user_id, kind, oauth_client_id, label, scopes, expires_at)
  select p_workspace, p_user, 'oauth', id, label, v_request.scopes, now() + interval '90 days'
  from public.agent_api_oauth_clients where id = v_request.client_id
  returning id into v_connection;
  insert into public.agent_api_oauth_codes (secret_hash, connection_id, redirect_uri, resource, challenge)
  values (p_code_hash, v_connection, v_request.redirect_uri, v_request.resource, v_request.challenge);
  return true;
end;
$$;

create function public.exchange_agent_api_token(
  p_kind text, p_secret_hash text, p_client text, p_resource text, p_redirect text,
  p_challenge text, p_access_hash text, p_refresh_hash text, p_scopes text[]
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_connection public.agent_api_connections%rowtype;
  v_token_used timestamptz;
  v_access_expires timestamptz;
begin
  if p_kind = 'authorization_code' then
    select connection.* into v_connection
    from public.agent_api_connections connection
    join public.agent_api_oauth_codes code on code.connection_id = connection.id
    where code.secret_hash = p_secret_hash and code.resource = p_resource
      and code.redirect_uri = p_redirect and code.challenge = p_challenge and code.expires_at > now()
      and connection.oauth_client_id = p_client
    for update of connection, code;
  elsif p_kind = 'refresh_token' then
    select connection.* into v_connection
    from public.agent_api_connections connection
    join public.agent_api_oauth_tokens token on token.connection_id = connection.id
    where token.secret_hash = p_secret_hash and token.resource = p_resource
      and token.kind = 'refresh' and token.expires_at > now()
      and connection.oauth_client_id = p_client
    for update of connection, token;
  end if;

  if v_connection.id is null or v_connection.revoked_at is not null or v_connection.expires_at <= now()
    or not coalesce(public.can_access_workspace(v_connection.user_id, v_connection.workspace_id), false)
    or (p_scopes is not null and (not p_scopes <@ v_connection.scopes or not p_scopes @> v_connection.scopes)) then
    return null;
  end if;

  if p_kind = 'authorization_code' then
    delete from public.agent_api_oauth_codes where secret_hash = p_secret_hash;
  else
    select used_at into v_token_used from public.agent_api_oauth_tokens where secret_hash = p_secret_hash;
    if v_token_used is not null then
      update public.agent_api_connections set revoked_at = now() where id = v_connection.id;
      return null;
    end if;
    update public.agent_api_oauth_tokens set used_at = now() where secret_hash = p_secret_hash;
  end if;

  v_access_expires := least(now() + interval '1 hour', v_connection.expires_at);
  insert into public.agent_api_oauth_tokens (secret_hash, connection_id, resource, kind, expires_at)
  values
    (p_access_hash, v_connection.id, p_resource, 'access', v_access_expires),
    (p_refresh_hash, v_connection.id, p_resource, 'refresh', v_connection.expires_at);
  return jsonb_build_object('scopes', v_connection.scopes, 'expiresIn', floor(extract(epoch from v_access_expires - now())));
end;
$$;

revoke all on function public.take_agent_api_rate_slot(text, int),
  public.authorize_agent_api_request(uuid, uuid, uuid, text, boolean),
  public.exchange_agent_api_token(text, text, text, text, text, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.take_agent_api_rate_slot(text, int),
  public.authorize_agent_api_request(uuid, uuid, uuid, text, boolean),
  public.exchange_agent_api_token(text, text, text, text, text, text, text, text, text[])
  to service_role;

create table public.agent_api_written_drafts (
  connection_id uuid not null references public.agent_api_connections(id) on delete cascade,
  idempotency_key text not null,
  body_hash text not null,
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (connection_id, idempotency_key)
);
create index agent_api_written_drafts_post_idx on public.agent_api_written_drafts(post_id);
alter table public.agent_api_written_drafts enable row level security;
revoke all on public.agent_api_written_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.agent_api_written_drafts to service_role;

create function public.create_agent_written_draft(
  p_connection uuid, p_user uuid, p_workspace uuid, p_caption text, p_idempotency text, p_body_hash text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_previous public.agent_api_written_drafts%rowtype;
  v_post uuid;
begin
  perform 1 from public.agent_api_connections
  where id = p_connection and user_id = p_user and workspace_id = p_workspace
    and revoked_at is null and expires_at > now() and 'drafts:write' = any(scopes)
  for update;
  if not found or not coalesce(public.can_access_workspace(p_user, p_workspace), false) then
    raise exception using errcode = '42501', message = 'Draft access denied';
  end if;

  if char_length(trim(p_caption)) not between 1 and 3000 then
    raise exception using errcode = '22023', message = 'Invalid caption';
  end if;
  select * into v_previous from public.agent_api_written_drafts
  where connection_id = p_connection and idempotency_key = p_idempotency;
  if found then
    if v_previous.body_hash <> p_body_hash then
      raise exception using errcode = '23505', message = 'Idempotency conflict';
    end if;
    return v_previous.post_id;
  end if;

  insert into public.posts(workspace_id, created_by, caption, status, created_via)
  values(p_workspace, p_user, p_caption, 'draft', 'written_posts')
  returning id into v_post;
  insert into public.agent_api_written_drafts(connection_id, idempotency_key, body_hash, post_id)
  values(p_connection, p_idempotency, p_body_hash, v_post);
  return v_post;
end;
$$;

create function public.rotate_agent_api_key(
  p_connection uuid, p_workspace uuid, p_user uuid, p_key_hash text, p_key_prefix text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.agent_api_connections set key_hash = p_key_hash, key_prefix = p_key_prefix, last_used_at = null
  where id = p_connection and workspace_id = p_workspace and user_id = p_user
    and kind = 'api_key' and revoked_at is null and expires_at > now()
    and public.can_access_workspace(p_user, p_workspace);
  return found;
end;
$$;

revoke all on function public.create_agent_written_draft(uuid, uuid, uuid, text, text, text),
  public.rotate_agent_api_key(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_agent_written_draft(uuid, uuid, uuid, text, text, text),
  public.rotate_agent_api_key(uuid, uuid, uuid, text, text) to service_role;
