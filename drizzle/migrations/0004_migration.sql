create table public.gsc_intents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  product_potential text not null default '',
  queries text[] not null default '{}',
  query_count int not null default 0,
  total_impressions bigint not null default 0,
  total_clicks bigint not null default 0,
  avg_position numeric not null default 0,
  built_url text,
  built_at timestamptz,
  synced_at timestamptz not null default now()
);
create table public.gsc_intent_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  intent_name text not null,
  description text not null default '',
  queries text[] not null default '{}',
  query_count int not null default 0,
  total_impressions bigint not null default 0,
  total_clicks bigint not null default 0,
  avg_position numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (snapshot_date, intent_name)
);
create table public.gsc_digest_log (
  id uuid primary key default gen_random_uuid(),
  digest_date date not null unique,
  status text not null,
  reason text,
  subject text,
  new_count int not null default 0,
  growing_count int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gsc_intents enable row level security;
alter table public.gsc_intent_snapshots enable row level security;
alter table public.gsc_digest_log enable row level security;
revoke all on public.gsc_intents, public.gsc_intent_snapshots, public.gsc_digest_log from anon, authenticated;
grant all on public.gsc_intents, public.gsc_intent_snapshots, public.gsc_digest_log to service_role;