create table public.x_refresh_locks (
  social_account_id uuid primary key references public.social_accounts(id) on delete cascade,
  lock_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.x_refresh_locks enable row level security;
revoke all on public.x_refresh_locks from public, anon, authenticated;
grant all on public.x_refresh_locks to service_role;
comment on table public.x_refresh_locks is 'Persistent one-use refresh guard. Ambiguous refresh failures require reconnect; never auto-expire.';

create function public.claim_x_refresh(_account_id uuid, _workspace_id uuid, _refresh_token text, _lock_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.social_accounts where id = _account_id and workspace_id = _workspace_id and platform = 'x' and refresh_token = _refresh_token and status <> 'disconnected' and is_enabled is not false for update;
  if not found then return false; end if;
  insert into public.x_refresh_locks(social_account_id, lock_id) values (_account_id, _lock_id) on conflict do nothing;
  return found;
end $$;
create function public.complete_x_refresh(_account_id uuid, _workspace_id uuid, _old_refresh text, _lock_id uuid, _access text, _refresh text, _expires_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.social_accounts where id = _account_id and workspace_id = _workspace_id and platform = 'x' and refresh_token = _old_refresh and status <> 'disconnected' and is_enabled is not false for update;
  if not found then return false; end if;
  if not exists(select 1 from public.x_refresh_locks where social_account_id = _account_id and lock_id = _lock_id) then return false; end if;
  update public.social_accounts set access_token = _access, refresh_token = _refresh, expires_at = _expires_at where id = _account_id;
  delete from public.x_refresh_locks where social_account_id = _account_id and lock_id = _lock_id;
  return true;
end $$;
revoke all on function public.claim_x_refresh(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_x_refresh(uuid, uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_x_refresh(uuid, uuid, text, uuid) to service_role;
grant execute on function public.complete_x_refresh(uuid, uuid, text, uuid, text, text, timestamptz) to service_role;
