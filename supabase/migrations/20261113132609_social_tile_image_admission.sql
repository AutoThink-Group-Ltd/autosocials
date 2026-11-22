-- Each admitted request counts even if it later fails or its provider outcome is uncertain.
-- This conservative admission happens before a paid provider call.
create table public.social_image_limits (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  monthly_limit integer not null default 10 check (monthly_limit between 0 and 1000)
);
create table public.social_image_admissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
create index social_image_admissions_month_idx on public.social_image_admissions(workspace_id, created_at);
alter table public.social_image_limits enable row level security;
alter table public.social_image_admissions enable row level security;
revoke all on public.social_image_limits, public.social_image_admissions from public, anon, authenticated;
grant all on public.social_image_limits, public.social_image_admissions to service_role;

create function public.admit_social_tile_image(_workspace_id uuid, _request_id uuid, _user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing boolean;
  current_limit integer;
  used integer;
  start_of_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
begin
  if _workspace_id is null or _request_id is null or _user_id is null
    or not coalesce(public.can_access_workspace(_user_id, _workspace_id), false) then
    raise exception 'Forbidden';
  end if;
  -- Serialize all admissions and retries for this workspace, including month rollover.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 0));
  select exists(select 1 from public.social_image_admissions where workspace_id = _workspace_id and request_id = _request_id) into existing;
  if existing then return jsonb_build_object('allowed', true, 'reused', true); end if;
  select coalesce((select monthly_limit from public.social_image_limits where workspace_id = _workspace_id), 10) into current_limit;
  select count(*) into used from public.social_image_admissions where workspace_id = _workspace_id and created_at >= start_of_month and created_at < start_of_month + interval '1 month';
  if used >= current_limit then return jsonb_build_object('allowed', false, 'reused', false); end if;
  insert into public.social_image_admissions(workspace_id, request_id) values (_workspace_id, _request_id);
  return jsonb_build_object('allowed', true, 'reused', false);
end $$;
revoke all on function public.admit_social_tile_image(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admit_social_tile_image(uuid, uuid, uuid) to service_role;
