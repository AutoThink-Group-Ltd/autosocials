-- Domain verification is workspace-specific; legacy workspace_domains rows are
-- writable by owners and cannot be treated as ownership proof.
create table public.outreach_domain_proofs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null,
  challenge text not null,
  verified_at timestamptz,
  primary key (workspace_id, domain)
);
alter table public.outreach_domain_proofs enable row level security;
revoke all on public.outreach_domain_proofs from public, anon, authenticated;
grant all on public.outreach_domain_proofs to service_role;
