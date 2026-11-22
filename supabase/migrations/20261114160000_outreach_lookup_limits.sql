create table public.outreach_lookup_usage (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index outreach_lookup_usage_workspace_time on public.outreach_lookup_usage(workspace_id,created_at);
alter table public.outreach_lookup_usage enable row level security;
revoke all on public.outreach_lookup_usage from public,anon,authenticated;
grant all on public.outreach_lookup_usage to service_role;
create function public.reserve_outreach_lookup(_workspace_id uuid,_user_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended(_workspace_id::text,91018));
 delete from public.outreach_lookup_usage where workspace_id=_workspace_id and created_at<now()-interval '1 day';
 if (select count(*) from public.outreach_lookup_usage where workspace_id=_workspace_id and created_at>=now()-interval '1 minute')>=5
  or (select count(*) from public.outreach_lookup_usage where workspace_id=_workspace_id and created_at>=now()-interval '1 day')>=30 then return false; end if;
 insert into public.outreach_lookup_usage(workspace_id) values (_workspace_id);
 return true;
end $$;
revoke all on function public.reserve_outreach_lookup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_outreach_lookup(uuid,uuid) to service_role;
