alter table public.agency_clients drop constraint agency_clients_workspace_kind_check;
alter table public.agency_clients add constraint agency_clients_workspace_kind_check
  check (workspace_kind in ('client', 'agency', 'personal', 'lead'));
-- A prospect has no app identity. Match the nullable link already used for uninvited clients.
alter table public.agency_client_links alter column client_user_id drop not null;

create function public.create_agency_lead(
  _actor uuid, _lead uuid, _name text, _contact text, _website text, _profiles jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  agency_owner uuid := public.agency_staff_owner(_actor);
  ws uuid;
begin
  if agency_owner is null or coalesce(public.agency_staff_role(_actor)::text, '') not in ('owner', 'admin') then
    raise exception 'Only agency owners and admins can add leads';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_lead::text, 438));
  select workspace_id into ws from public.agency_clients
    where id = _lead and agency_user_id = agency_owner and workspace_kind = 'lead' and status = 'active';
  if found then return ws; end if;

  insert into public.workspaces (name, website, contact_name, social_profiles)
    values (_name, _website, _contact, _profiles) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (ws, agency_owner, 'owner');
  insert into public.agency_clients (id, agency_user_id, workspace_id, client_name, client_contact_name, social_profiles, workspace_kind, status, onboarded_at)
    values (_lead, agency_owner, ws, _name, _contact, _profiles, 'lead', 'active', now());
  insert into public.agency_client_links (agency_user_id, workspace_id, agency_client_id, status, connected_at)
    values (agency_owner, ws, _lead, 'active', now());
  return ws;
end $$;
revoke all on function public.create_agency_lead(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_agency_lead(uuid, uuid, text, text, text, jsonb) to service_role;

create table public.agency_lead_offers (
  id uuid primary key,
  lead_id uuid not null references public.agency_clients(id) on delete cascade,
  created_by uuid not null,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  agency_name text not null,
  recipient_name text not null,
  title text not null check (char_length(title) between 1 and 160),
  description text not null check (char_length(description) between 1 and 4000),
  next_steps text not null default '' check (char_length(next_steps) <= 1000),
  price_minor integer not null check (price_minor between 1 and 100000000),
  currency text not null check (currency in ('GBP', 'USD', 'EUR')),
  cadence text not null check (cadence in ('monthly', 'one_off')),
  samples jsonb not null check (jsonb_typeof(samples) = 'array' and jsonb_array_length(samples) between 1 and 20),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  decision text check (decision in ('accepted', 'declined')),
  decided_at timestamptz,
  check ((decision is null) = (decided_at is null))
);
create index agency_lead_offers_lead_created_idx on public.agency_lead_offers (lead_id, created_at desc);
alter table public.agency_lead_offers enable row level security;
revoke all on public.agency_lead_offers from public, anon, authenticated;
grant select, insert, update on public.agency_lead_offers to service_role;

create table public.agency_lead_offer_events (
  offer_id uuid not null references public.agency_lead_offers(id) on delete cascade,
  visit_id uuid not null,
  event text not null check (event in ('view', 'sample_click')),
  sample_key text not null default '',
  created_at timestamptz not null default now(),
  primary key (offer_id, visit_id, event, sample_key),
  check ((event = 'view' and sample_key = '') or (event = 'sample_click' and char_length(sample_key) between 1 and 64))
);
alter table public.agency_lead_offer_events enable row level security;
revoke all on public.agency_lead_offer_events from public, anon, authenticated;
grant select, insert on public.agency_lead_offer_events to service_role;

create function public.record_agency_lead_offer_event(_token text, _visit uuid, _event text, _sample text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare offer public.agency_lead_offers%rowtype;
begin
  select o.* into offer from public.agency_lead_offers o
    join public.agency_clients l on l.id = o.lead_id
    where o.token = _token and o.revoked_at is null and l.status = 'active' and l.workspace_kind = 'lead'
    for share of o;
  if not found then return false; end if;
  if _event = 'sample_click' then
    if not exists (select 1 from pg_catalog.jsonb_array_elements(offer.samples) s where s->>'key' = _sample)
       or not exists (select 1 from public.agency_lead_offer_events
         where offer_id = offer.id and visit_id = _visit and event = 'view' and sample_key = '') then
      return false;
    end if;
  elsif _event is distinct from 'view' or _sample is distinct from '' then
    return false;
  end if;
  insert into public.agency_lead_offer_events (offer_id, visit_id, event, sample_key)
    values (offer.id, _visit, _event, _sample) on conflict do nothing;
  return true;
end $$;
revoke all on function public.record_agency_lead_offer_event(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_agency_lead_offer_event(text, uuid, text, text) to service_role;

create function public.respond_to_agency_lead_offer(_token text, _decision text)
returns text language plpgsql security invoker set search_path = '' as $$
declare offer public.agency_lead_offers%rowtype;
begin
  if _decision is null or _decision not in ('accepted', 'declined') then raise exception 'Invalid response'; end if;
  select o.* into offer from public.agency_lead_offers o
    join public.agency_clients l on l.id = o.lead_id
    where o.token = _token and o.revoked_at is null and l.status = 'active' and l.workspace_kind = 'lead'
    for update of o;
  if not found then return null; end if;
  if offer.decision is not null then return offer.decision; end if;
  update public.agency_lead_offers set decision = _decision, decided_at = now() where id = offer.id;
  return _decision;
end $$;
revoke all on function public.respond_to_agency_lead_offer(text, text) from public, anon, authenticated;
grant execute on function public.respond_to_agency_lead_offer(text, text) to service_role;

create function public.agency_lead_offer_stats(_offers uuid[])
returns table (offer_id uuid, views bigint, sample_clicks bigint)
language sql stable security invoker set search_path = '' as $$
  select e.offer_id, count(*) filter (where e.event = 'view'),
    count(*) filter (where e.event = 'sample_click')
  from public.agency_lead_offer_events e
  where e.offer_id = any(_offers)
  group by e.offer_id;
$$;
revoke all on function public.agency_lead_offer_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.agency_lead_offer_stats(uuid[]) to service_role;
