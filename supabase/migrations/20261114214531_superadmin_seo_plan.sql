-- Private Superadmin planning data. Planned paths are not public routes.
create table public.seo_batches (
  id uuid primary key default gen_random_uuid(),
  cluster_slug text not null, cluster_name text not null, name text not null, angle text not null,
  prompt text not null, status text not null default 'planned' check (status in ('planned','in_progress','done')),
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table public.seo_pages (
  id uuid primary key default gen_random_uuid(), path text not null unique, title text not null,
  cluster_slug text not null, target_keyword text, status text not null default 'planned' check (status in ('planned','in_progress','live')),
  batch_id uuid references public.seo_batches(id) on delete set null, notes text, created_at timestamptz not null default now()
);
alter table public.seo_batches enable row level security;
alter table public.seo_pages enable row level security;
revoke all on public.seo_batches from anon, authenticated;
revoke all on public.seo_pages from anon, authenticated;
grant select, insert, update, delete on public.seo_batches, public.seo_pages to service_role;
