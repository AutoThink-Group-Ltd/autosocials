-- Durable preparation is separate from paid video generation.
create table public.creative_planning_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.creative_batches(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  request_hash text not null check (length(request_hash)=64),
  input jsonb not null, checkpoint jsonb, result jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  progress text not null default 'Your video preparation is queued', error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz,
  unique(batch_id,request_hash)
);
create unique index creative_planning_one_active_batch on public.creative_planning_jobs(batch_id) where status in ('queued','running');
create index creative_planning_queue on public.creative_planning_jobs(status,created_at);
alter table public.creative_batches add column active_plan_id uuid references public.creative_planning_jobs(id);
alter table public.creative_planning_jobs enable row level security;
revoke all on public.creative_planning_jobs from anon,authenticated;
grant select on public.creative_planning_jobs to authenticated;
grant all on public.creative_planning_jobs to service_role;
create policy creative_planning_member_read on public.creative_planning_jobs for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));

create table public.creative_failure_notifications (
  kind text not null check(kind in ('planning','render')), job_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid, status text not null check(status in ('sending','sent','delivery_unconfirmed','preexisting')),
  created_at timestamptz not null default now(), sent_at timestamptz, provider_message_id text,
  primary key(kind,job_id)
);
alter table public.creative_failure_notifications enable row level security;
revoke all on public.creative_failure_notifications from anon,authenticated;
grant all on public.creative_failure_notifications to service_role;
-- Do not send a retrospective burst for failures that predate this release.
insert into public.creative_failure_notifications(kind,job_id,workspace_id,batch_id,status)
select 'render',r.id,r.workspace_id,v.batch_id,'preexisting' from public.render_jobs r left join public.creative_variants v on v.id=r.variant_id where r.status='failed'
on conflict(kind,job_id) do nothing;

-- Admission is serialized per batch; duplicate HTTP requests cannot create duplicate LLM plans.
create function public.enqueue_creative_planning(_batch_id uuid,_workspace_id uuid,_created_by uuid,_request_hash text,_input jsonb,_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.creative_planning_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(_batch_id::text,0));
  if not exists(select 1 from public.creative_batches where id=_batch_id and workspace_id=_workspace_id) or not public.can_access_workspace(_created_by,_workspace_id) then raise exception 'Forbidden'; end if;
  if jsonb_typeof(_input)<>'object' or not ((_input->>'count')::integer between 1 and 4) then raise exception 'Invalid video count'; end if;
  select * into j from public.creative_planning_jobs where batch_id=_batch_id and status in ('queued','running') order by created_at desc limit 1;
  if found then return to_jsonb(j); end if;
  select * into j from public.creative_planning_jobs where batch_id=_batch_id and request_hash=_request_hash;
  if found then
    if j.status='failed' and _retry then
      update public.creative_planning_jobs set status='queued',progress='Your video preparation is queued',error=null,started_at=null,completed_at=null,updated_at=now() where id=j.id returning * into j;
    end if;
    return to_jsonb(j);
  end if;
  insert into public.creative_planning_jobs(batch_id,workspace_id,created_by,request_hash,input) values(_batch_id,_workspace_id,_created_by,_request_hash,_input) returning * into j;
  return to_jsonb(j);
end $$;
revoke all on function public.enqueue_creative_planning(uuid,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_creative_planning(uuid,uuid,uuid,text,jsonb,boolean) to service_role;

-- Continue user-confirmed preparation even when its browser has navigated away.
create or replace function public.advance_creative_engine_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare job_secret text; worker_url text;
begin
  if not exists(select 1 from public.creative_planning_jobs where status in ('queued','running')) and not exists(select 1 from public.render_jobs r where r.production_state->>'engine_version'='1' and r.status in ('queued','preparing','rendering')) then return; end if;
  select secret into job_secret from public.internal_job_secrets where name='creative_engine';
  if job_secret is null then raise exception 'Creative job authentication is unavailable'; end if;
  SELECT NULLIF(btrim(decrypted_secret), '') INTO worker_url
  FROM vault.decrypted_secrets WHERE name = 'creative_jobs_url';
  IF worker_url IS NULL THEN RETURN; END IF;
  perform net.http_post(url := worker_url, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-creative-secret',job_secret),timeout_milliseconds := 300000);
end $$;
revoke all on function public.advance_creative_engine_jobs() from public,anon,authenticated;
grant execute on function public.advance_creative_engine_jobs() to service_role;
