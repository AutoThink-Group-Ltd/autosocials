create table public.creation_schedule_failure_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null,
 creation_type text check (creation_type in ('tile','video')),
 creation_id uuid,
 stage text not null check (stage in ('prepare','confirm','delivery')),
 category text not null check (category in ('access','account','approval','media','timing','provider','other')),
 occurred_at timestamptz not null default now()
);
create index creation_schedule_failure_events_time on public.creation_schedule_failure_events(occurred_at desc);
alter table public.creation_schedule_failure_events enable row level security;
revoke all on public.creation_schedule_failure_events from public, anon, authenticated, service_role;
grant select, insert on public.creation_schedule_failure_events to service_role;
grant select on public.creation_schedule_failure_events to authenticated;
create policy creation_schedule_failure_events_super_admin_read on public.creation_schedule_failure_events for select to authenticated using ((select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
