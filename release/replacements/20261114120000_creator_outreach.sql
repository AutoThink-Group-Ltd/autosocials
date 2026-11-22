create table public.outreach_campaigns (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, brief text not null default '', created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.outreach_creators (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade, creator_profile_id uuid references public.creator_profiles(id) on delete set null,
 name text not null, username text, platform text, email text, contact_source text, profile_url text, bio text,
 subject text not null default '', body text not null default '', version integer not null default 1,
 interest text not null default 'unknown' check (interest in ('unknown','interested','not_interested')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index outreach_creator_email_unique on public.outreach_creators(campaign_id, lower(email)) where email is not null and email <> '';
create table public.outreach_batches (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade, created_by uuid not null,
 snapshot jsonb not null, status text not null default 'review' check (status in ('review','approved','cancelled')),
 created_at timestamptz not null default now(), approved_at timestamptz
);
create table public.outreach_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade, creator_id uuid not null references public.outreach_creators(id),
 batch_id uuid not null references public.outreach_batches(id), sender_identity_id uuid references public.sender_identities(id) on delete set null,
 from_name text not null, from_email text not null, signature text not null default '', to_email text not null, to_name text,
 subject text not null, body text not null, status text not null default 'queued' check (status in ('queued','claimed','accepted','delivered','failed','ambiguous','cancelled')),
 attempt_count integer not null default 0, claimed_at timestamptz, provider_message_id text, error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(batch_id,creator_id)
);
create index outreach_jobs_queue on public.outreach_jobs(created_at) where status = 'queued';
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_creators enable row level security;
alter table public.outreach_batches enable row level security;
alter table public.outreach_jobs enable row level security;
create policy outreach_campaigns_read on public.outreach_campaigns for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));
create policy outreach_creators_read on public.outreach_creators for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));
create policy outreach_batches_read on public.outreach_batches for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));
create policy outreach_jobs_read on public.outreach_jobs for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));

create or replace function public.approve_outreach_batch(_batch_id uuid, _workspace_id uuid, _user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.outreach_batches%rowtype; item jsonb; sender jsonb;
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 select * into b from public.outreach_batches where id=_batch_id and workspace_id=_workspace_id for update;
 if not found then raise exception 'Review not found'; end if;
 if b.created_by <> _user_id then raise exception 'Only the reviewer can approve this batch'; end if;
 if b.status='approved' then return b.id; end if;
 if b.status <> 'review' then raise exception 'Review is no longer available'; end if;
 sender := b.snapshot->'sender';
 if not exists(select 1 from public.sender_identities where id=(sender->>'id')::uuid and workspace_id=_workspace_id and is_verified and sender_name=sender->>'name' and sender_email=sender->>'email') then raise exception 'Sender changed; review again'; end if;
 for item in select * from jsonb_array_elements(b.snapshot->'creators') loop
  perform 1 from public.outreach_creators c where c.id=(item->>'id')::uuid and c.workspace_id=_workspace_id and c.campaign_id=b.campaign_id and c.version=(item->>'version')::integer and c.email=item->>'email' and c.subject=item->>'subject' and c.body=item->>'body' for update;
  if not found then raise exception 'A draft or recipient changed; review again'; end if;
 end loop;
 insert into public.outreach_jobs(workspace_id,campaign_id,creator_id,batch_id,sender_identity_id,from_name,from_email,signature,to_email,to_name,subject,body)
 select _workspace_id,b.campaign_id,(x->>'id')::uuid,b.id,(sender->>'id')::uuid,sender->>'name',sender->>'email',coalesce(b.snapshot->>'signature',''),x->>'email',x->>'name',x->>'subject',x->>'body'
 from jsonb_array_elements(b.snapshot->'creators') x;
 update public.outreach_batches set status='approved',approved_at=now() where id=b.id;
 return b.id;
end $$;
create or replace function public.claim_outreach_jobs(_limit integer default 10) returns setof public.outreach_jobs
language sql security definer set search_path = public as $$
 update public.outreach_jobs j set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now()
 where id in (select id from public.outreach_jobs where status='queued' order by created_at for update skip locked limit greatest(0,least(_limit,50))) returning j.*
$$;
create or replace function public.cancel_outreach_batch(_batch_id uuid,_workspace_id uuid,_user_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 perform 1 from public.outreach_batches where id=_batch_id and workspace_id=_workspace_id for update;
 if not found then raise exception 'Batch not found'; end if;
 update public.outreach_jobs set status='cancelled',updated_at=now() where batch_id=_batch_id and workspace_id=_workspace_id and status='queued';
 get diagnostics n = row_count;
 update public.outreach_batches set status='cancelled' where id=_batch_id;
 return n;
end $$;
revoke all on function public.approve_outreach_batch(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_outreach_jobs(integer) from public, anon, authenticated;
revoke all on function public.cancel_outreach_batch(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_outreach_batch(uuid,uuid,uuid), public.claim_outreach_jobs(integer), public.cancel_outreach_batch(uuid,uuid,uuid) to service_role;
create table public.outreach_sender_settings (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 from_name text, signature_text text not null default '', sending_paused boolean not null default false,
 hourly_limit integer not null default 50 check (hourly_limit between 1 and 50), daily_limit integer not null default 200 check (daily_limit between 1 and 200), updated_at timestamptz not null default now()
);
alter table public.outreach_sender_settings enable row level security;
create policy outreach_settings_read on public.outreach_sender_settings for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));
create table public.outreach_webhook_events (id text primary key, created_at timestamptz not null default now());
alter table public.outreach_webhook_events enable row level security;
alter table public.email_replies add column outreach_job_id uuid references public.outreach_jobs(id), add column provider_event_id text unique;

create or replace function public.approve_outreach_batch(_batch_id uuid, _workspace_id uuid, _user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.outreach_batches%rowtype; item jsonb; sender jsonb; actual_name text; actual_signature text;
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 select * into b from public.outreach_batches where id=_batch_id and workspace_id=_workspace_id for update;
 if not found then raise exception 'Review not found'; end if;
 if b.created_by <> _user_id then raise exception 'Only the reviewer can approve this batch'; end if;
 if b.status='approved' then return b.id; end if;
 if b.status <> 'review' then raise exception 'Review is no longer available'; end if;
 sender := b.snapshot->'sender';
 if sender->>'id' is null then
  select coalesce(nullif(s.from_name,''),'AutoSocials'),coalesce(s.signature_text,'') into actual_name,actual_signature from (select 1) x left join public.outreach_sender_settings s on s.workspace_id=_workspace_id;
  if sender->>'email'<>'info@autosocials.com' then raise exception 'Sender changed; review again'; end if;
 else
  select coalesce(nullif(s.from_name,''),i.sender_name), coalesce(s.signature_text,'') into actual_name,actual_signature from public.sender_identities i left join public.outreach_sender_settings s on s.workspace_id=i.workspace_id where i.id=(sender->>'id')::uuid and i.workspace_id=_workspace_id and i.is_verified and lower(i.sender_email)=lower(sender->>'email');
  if not found or not exists(select 1 from public.workspace_domains d where d.workspace_id=_workspace_id and lower(d.domain)=split_part(lower(sender->>'email'),'@',2) and d.status='verified' and d.sendgrid_domain_id is not null) then raise exception 'Sender changed; review again'; end if;
 end if;
 if actual_name<>sender->>'name' or actual_signature<>coalesce(b.snapshot->>'signature','') then raise exception 'Sender changed; review again'; end if;
 if jsonb_array_length(b.snapshot->'creators')=0 then raise exception 'Empty review'; end if;
 for item in select * from jsonb_array_elements(b.snapshot->'creators') loop
  perform 1 from public.outreach_creators c where c.id=(item->>'id')::uuid and c.workspace_id=_workspace_id and c.campaign_id=b.campaign_id and c.version=(item->>'version')::integer and c.email=item->>'email' and c.subject=item->>'subject' and c.body=item->>'body' for update;
  if not found then raise exception 'A draft or recipient changed; review again'; end if;
  if exists(select 1 from public.blocked_contacts where workspace_id=_workspace_id and lower(email)=lower(item->>'email')) then raise exception 'A recipient is suppressed'; end if;
  if exists(select 1 from public.outreach_jobs where creator_id=(item->>'id')::uuid and status in ('queued','claimed','accepted','delivered','ambiguous')) then raise exception 'A message for this creator is already queued or sent'; end if;
 end loop;
 insert into public.outreach_jobs(workspace_id,campaign_id,creator_id,batch_id,sender_identity_id,from_name,from_email,signature,to_email,to_name,subject,body)
 select _workspace_id,b.campaign_id,(x->>'id')::uuid,b.id,(sender->>'id')::uuid,sender->>'name',sender->>'email',coalesce(b.snapshot->>'signature',''),x->>'email',x->>'name',x->>'subject',x->>'body' from jsonb_array_elements(b.snapshot->'creators') x;
 update public.outreach_batches set status='approved',approved_at=now() where id=b.id; return b.id;
end $$;
drop function public.claim_outreach_jobs(integer);
create function public.claim_outreach_jobs(_limit integer default 10, _workspace_id uuid default null) returns setof public.outreach_jobs
language plpgsql security definer set search_path = public as $$
declare w uuid; candidate uuid; hourly integer; daily integer; remaining integer; n integer := 0;
begin
 update public.outreach_jobs set status='ambiguous',error_message='Claim expired; delivery outcome requires reconciliation',updated_at=now() where status='claimed' and claimed_at < now()-interval '10 minutes' and (_workspace_id is null or workspace_id=_workspace_id);
 for w in select distinct workspace_id from public.outreach_jobs where status='queued' and (_workspace_id is null or workspace_id=_workspace_id) loop
  perform pg_advisory_xact_lock(hashtextextended(w::text, 91017));
  if exists(select 1 from public.outreach_sender_settings where workspace_id=w and sending_paused) or exists(select 1 from public.workspace_sendgrid_config where workspace_id=w and sending_paused) then continue; end if;
  select coalesce(s.hourly_limit,50),coalesce(s.daily_limit,200) into hourly,daily from (select 1) x left join public.outreach_sender_settings s on s.workspace_id=w;
  select least(hourly-count(*) filter (where claimed_at >= now()-interval '1 hour'),daily-count(*))::integer into remaining from public.outreach_jobs where workspace_id=w and claimed_at >= now()-interval '24 hours' and status in ('claimed','accepted','delivered','ambiguous','failed');
  update public.outreach_jobs j set status='cancelled',error_message='Recipient suppressed',updated_at=now() where j.workspace_id=w and j.status='queued' and exists(select 1 from public.blocked_contacts b where b.workspace_id=w and lower(b.email)=lower(j.to_email));
  for candidate in select id from public.outreach_jobs where workspace_id=w and status='queued' order by created_at for update skip locked limit greatest(0,least(remaining,_limit-n,50)) loop
   return query update public.outreach_jobs set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now() where id=candidate returning *;
   n:=n+1;
  end loop;
  exit when n >= _limit;
 end loop;
end $$;
revoke all on function public.claim_outreach_jobs(integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_outreach_jobs(integer,uuid) to service_role;


-- Explicit privileges keep clients read-only; all mutation goes through authorized server code.
revoke all on public.outreach_campaigns, public.outreach_creators, public.outreach_batches, public.outreach_jobs, public.outreach_sender_settings, public.outreach_webhook_events from anon, authenticated;
grant select on public.outreach_campaigns, public.outreach_creators, public.outreach_batches, public.outreach_jobs, public.outreach_sender_settings to authenticated;
grant all on public.outreach_campaigns, public.outreach_creators, public.outreach_batches, public.outreach_jobs, public.outreach_sender_settings, public.outreach_webhook_events to service_role;

-- Inactive until the endpoint is deployed and separately enabled.
insert into public.internal_job_secrets(name,secret) values ('outreach_worker',encode(extensions.gen_random_bytes(32),'hex')) on conflict (name) do nothing;
create function public.advance_outreach_worker() returns void language plpgsql security definer set search_path='' as $$
declare job_secret text;
begin
 if not exists(select 1 from public.outreach_jobs where status in ('queued','claimed')) then return; end if;
 select secret into job_secret from public.internal_job_secrets where name='outreach_worker';
 if job_secret is null then raise exception 'Outreach worker authentication is unavailable'; end if;
 raise exception 'Outreach worker scheduling is disabled until configured by the operator';
end $$;
revoke all on function public.advance_outreach_worker() from public,anon,authenticated;
grant execute on function public.advance_outreach_worker() to service_role;
-- Self-host: no outreach-worker cron job is installed automatically.

-- Preserve the existing module values while allowing Outreach conversation history.
alter table public.agent_threads drop constraint if exists agent_threads_module_check;
alter table public.agent_threads add constraint agent_threads_module_check check (module in ('create','schedule','winners','campaigns','learn','outreach'));
insert into public.internal_job_secrets(name,secret) values ('outreach_inbound',encode(extensions.gen_random_bytes(32),'hex')) on conflict (name) do nothing;
