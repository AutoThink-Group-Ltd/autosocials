-- All reads and writes pass through workspace-authorised server functions.
create table public.brand_dna_versions (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dna jsonb not null check (jsonb_typeof(dna)='object'), guidelines text not null,
  overrides jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create table public.brand_dna_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  active_version uuid, candidate_version uuid, confirmed boolean not null default false,
  foreign key(workspace_id,active_version) references public.brand_dna_versions(workspace_id,id),
  foreign key(workspace_id,candidate_version) references public.brand_dna_versions(workspace_id,id)
);
create table public.brand_dna_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_kind text not null check(source_kind in ('website','package')), source text not null,
  status text not null default 'queued' check(status in ('queued','running','complete','failed','superseded')),
  phase text not null default 'Waiting to start', error text, token uuid, lease_until timestamptz,
  attempts integer not null default 0, created_at timestamptz not null default now()
);
create unique index dna_one_run on public.brand_dna_runs(workspace_id) where status in ('queued','running');
create index dna_runs_queue on public.brand_dna_runs(status,created_at) where status in ('queued','running');
create index dna_runs_history on public.brand_dna_runs(workspace_id,created_at desc);
create table public.brand_dna_tiles (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  version_id uuid not null, kind text not null check(kind in ('product','promotional','educational')),
  status text not null default 'queued' check(status in ('queued','running','ready','failed')),
  path text, notes text[] not null default '{}', token uuid, lease_until timestamptz, error text,
  created_at timestamptz not null default now(), unique(version_id,kind),
  foreign key(workspace_id,version_id) references public.brand_dna_versions(workspace_id,id) on delete cascade
);
create index dna_tiles_queue on public.brand_dna_tiles(status,created_at) where status in ('queued','running');
create table public.brand_dna_imports (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null, bytes bigint not null check(bytes between 1 and 104857600), created_at timestamptz not null default now()
);
create table public.brand_dna_production_inputs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade, job_key text not null,
  version_id uuid, primary key(workspace_id,job_key),
  foreign key(workspace_id,version_id) references public.brand_dna_versions(workspace_id,id)
);
alter table public.brand_dna_versions enable row level security;
alter table public.brand_dna_state enable row level security;
alter table public.brand_dna_runs enable row level security;
alter table public.brand_dna_tiles enable row level security;
alter table public.brand_dna_imports enable row level security;
alter table public.brand_dna_production_inputs enable row level security;
revoke all on public.brand_dna_versions,public.brand_dna_state,public.brand_dna_runs,public.brand_dna_tiles,public.brand_dna_imports,public.brand_dna_production_inputs from public,anon,authenticated;
grant all on public.brand_dna_versions,public.brand_dna_state,public.brand_dna_runs,public.brand_dna_tiles,public.brand_dna_imports,public.brand_dna_production_inputs to service_role;
-- Private objects are immutable. Managers receive scoped, short-lived upload tokens for bounded parts.
insert into storage.buckets(id,name,public) values('brand-dna-private','brand-dna-private',false) on conflict(id) do nothing;

create function public.enqueue_brand_dna(p_workspace uuid,p_kind text,p_source text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare j public.brand_dna_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,901));
  insert into public.brand_dna_state(workspace_id) values(p_workspace) on conflict do nothing;
  perform 1 from public.brand_dna_state where workspace_id=p_workspace for update;
  select * into j from public.brand_dna_runs where workspace_id=p_workspace and status in ('queued','running') for update;
  if found then
    if j.source=p_source and j.source_kind=p_kind then return j.id; end if;
    update public.brand_dna_runs set status='superseded',token=null where id=j.id;
  end if;
  insert into public.brand_dna_runs(workspace_id,source_kind,source) values(p_workspace,p_kind,p_source) returning * into j;
  return j.id;
end $$;
-- A database trigger covers signup, agency onboarding and later edits to the workspace website.
create function public.brand_dna_website_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(btrim(new.website),'') is not null and (tg_op='INSERT' or new.website is distinct from old.website) then
    perform public.enqueue_brand_dna(new.id,'website',btrim(new.website));
  elsif tg_op='UPDATE' and new.website is distinct from old.website then
    update public.brand_dna_runs set status='superseded',token=null where workspace_id=new.id and source_kind='website' and status in ('queued','running');
  end if;
  return new;
end $$;
create trigger brand_dna_workspace_website after insert or update of website on public.workspaces for each row execute function public.brand_dna_website_changed();

create function public.claim_brand_dna(p_workspace uuid default null,p_prefer_tile boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.brand_dna_runs; t public.brand_dna_tiles;
begin
  update public.brand_dna_runs set status='failed',phase='Analysis interrupted',error='Rebuild DNA to resume.',token=null
    where status='running' and lease_until<now() and attempts>=3 and (p_workspace is null or workspace_id=p_workspace);
  if not p_prefer_tile or not exists(select 1 from public.brand_dna_tiles tile join public.brand_dna_state s on s.active_version=tile.version_id
    where tile.status='queued' and (p_workspace is null or tile.workspace_id=p_workspace)) then
    select * into j from public.brand_dna_runs where (status='queued' or (status='running' and lease_until<now()))
      and (p_workspace is null or workspace_id=p_workspace) order by created_at limit 1 for update skip locked;
  end if;
  if j.id is not null then
    update public.brand_dna_runs set status='running',phase='Reading sources',token=gen_random_uuid(),lease_until=now()+interval '8 minutes',attempts=attempts+1 where id=j.id returning * into j;
    return jsonb_build_object('type','run','job',to_jsonb(j));
  end if;
  -- A provider outcome may be uncertain after an interruption. Require a deliberate retry.
  update public.brand_dna_tiles set status='failed',error='Rendering was interrupted. Retry this example.',token=null
    where status='running' and lease_until<now() and (p_workspace is null or workspace_id=p_workspace);
  select tile.* into t from public.brand_dna_tiles tile join public.brand_dna_state s on s.workspace_id=tile.workspace_id and s.active_version=tile.version_id
    where tile.status='queued' and (p_workspace is null or tile.workspace_id=p_workspace) order by tile.created_at,tile.kind limit 1 for update of tile skip locked;
  if found then
    update public.brand_dna_tiles set status='running',token=gen_random_uuid(),lease_until=now()+interval '8 minutes' where id=t.id returning * into t;
    return jsonb_build_object('type','tile','job',to_jsonb(t));
  end if;
  return null;
end $$;

-- Optimistically install a complete, immutable version; pins and exports always refer to a version ID.
create function public.save_brand_dna_version(p_workspace uuid,p_expected uuid,p_id uuid,p_dna jsonb,p_guidelines text,p_overrides jsonb,p_job uuid,p_token uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare s public.brand_dna_state; candidate boolean;
begin
  select * into s from public.brand_dna_state where workspace_id=p_workspace for update;
  if not found then raise exception 'Unknown DNA workspace'; end if;
  if p_job is not null and not exists(select 1 from public.brand_dna_runs where id=p_job and workspace_id=p_workspace and status='running' and token=p_token for update) then return 'superseded'; end if;
  if s.active_version is distinct from p_expected then return 'conflict'; end if;
  candidate := p_job is not null and s.confirmed;
  insert into public.brand_dna_versions(id,workspace_id,dna,guidelines,overrides) values(p_id,p_workspace,p_dna,p_guidelines,p_overrides);
  if candidate then update public.brand_dna_state set candidate_version=p_id where workspace_id=p_workspace;
  else
    update public.brand_dna_state set active_version=p_id,candidate_version=null where workspace_id=p_workspace;
    insert into public.brand_dna_tiles(workspace_id,version_id,kind) select p_workspace,p_id,k from unnest(array['product','promotional','educational']) k;
  end if;
  if p_job is not null then update public.brand_dna_runs set status='complete',phase='Identity ready',token=null,lease_until=null where id=p_job; end if;
  return 'saved';
end $$;

create function public.adopt_brand_dna_version(p_workspace uuid,p_expected uuid,p_candidate uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.brand_dna_state set active_version=p_candidate,candidate_version=null,confirmed=true where workspace_id=p_workspace and active_version=p_expected and candidate_version=p_candidate;
  if not found then return false; end if;
  insert into public.brand_dna_tiles(workspace_id,version_id,kind) select p_workspace,p_candidate,k from unnest(array['product','promotional','educational']) k on conflict do nothing;
  return true;
end $$;

create function public.advance_brand_dna_jobs() returns void language plpgsql security definer set search_path='' as $$
declare job_secret text; worker_url text;
begin
  if not exists(select 1 from public.brand_dna_runs where status='queued' or (status='running' and lease_until<now()))
     and not exists(select 1 from public.brand_dna_tiles t join public.brand_dna_state s on s.active_version=t.version_id where t.status='queued' or (t.status='running' and t.lease_until<now())) then return; end if;
  select secret into job_secret from public.internal_job_secrets where name='creative_engine';
  if job_secret is null then raise exception 'Creative job authentication unavailable'; end if;
  SELECT NULLIF(btrim(decrypted_secret), '') INTO worker_url
  FROM vault.decrypted_secrets WHERE name = 'brand_dna_jobs_url';
  IF worker_url IS NULL THEN RETURN; END IF;
  perform net.http_post(url:=worker_url,body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-creative-secret',job_secret),timeout_milliseconds:=300000);
end $$;
revoke all on function public.enqueue_brand_dna(uuid,text,text),public.brand_dna_website_changed(),public.claim_brand_dna(uuid,boolean),public.save_brand_dna_version(uuid,uuid,uuid,jsonb,text,jsonb,uuid,uuid),public.adopt_brand_dna_version(uuid,uuid,uuid),public.advance_brand_dna_jobs() from public,anon,authenticated;
grant execute on function public.enqueue_brand_dna(uuid,text,text),public.claim_brand_dna(uuid,boolean),public.save_brand_dna_version(uuid,uuid,uuid,jsonb,text,jsonb,uuid,uuid),public.adopt_brand_dna_version(uuid,uuid,uuid),public.advance_brand_dna_jobs() to service_role;
create function public.pin_brand_dna(p_workspace uuid,p_key text,p_requested uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v uuid; s public.brand_dna_state;
begin
  if length(p_key) not between 1 and 250 then raise exception 'Invalid production key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,901));
  select version_id into v from public.brand_dna_production_inputs where workspace_id=p_workspace and job_key=p_key;
  if found then return jsonb_build_object('id',v,'ready',true); end if;
  select * into s from public.brand_dna_state where workspace_id=p_workspace for share;
  if found and s.active_version is null and exists(select 1 from public.brand_dna_runs where workspace_id=p_workspace and status<>'superseded') then return jsonb_build_object('ready',false); end if;
  v:=coalesce(p_requested,s.active_version);
  insert into public.brand_dna_production_inputs(workspace_id,job_key,version_id) values(p_workspace,p_key,v);
  return jsonb_build_object('id',v,'ready',true);
end $$;
revoke all on function public.pin_brand_dna(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pin_brand_dna(uuid,text,uuid) to service_role;

-- One provider reservation per illustrative tile, independently of customer credit accounts.
create table public.brand_dna_artwork_usage (
 tile_id uuid primary key references public.brand_dna_tiles(id) on delete cascade,
 provider text not null default 'openai', model text not null, status text not null default 'reserved'
 check(status in ('reserved','stored','uncertain')), path text not null, created_at timestamptz not null default now()
);
alter table public.brand_dna_artwork_usage enable row level security;
revoke all on public.brand_dna_artwork_usage from public,anon,authenticated;
grant all on public.brand_dna_artwork_usage to service_role;
select cron.schedule('autosocials-brand-dna','* * * * *','select public.advance_brand_dna_jobs()');
