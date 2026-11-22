-- Only settle when a finished asset is durably represented in the same workspace.
-- Failed or ambiguous provider work remains held for human reconciliation.
create index content_credit_unresolved_reservations on public.content_credit_reservations(workspace_id, request_key)
  where state in ('reserved', 'reconciliation_required');

create function public.reconcile_content_credit_completions()
returns integer language plpgsql security invoker set search_path = '' as $$
declare resolved integer;
begin
  update public.content_credit_reservations r set state = 'settled', updated_at = now()
  where r.state in ('reserved', 'reconciliation_required') and (
    (r.request_key ~ '^render:[0-9a-fA-F-]{36}$' and exists (
      select 1 from public.render_jobs j where j.id::text = substring(r.request_key from 8)
        and j.workspace_id = r.workspace_id and j.status = 'done' and j.storage_path is not null
    )) or
    (r.request_key ~ '^social-tile:[0-9a-fA-F-]{36}$' and exists (
      select 1 from public.brand_files f where f.id::text = substring(r.request_key from 13)
        and f.workspace_id = r.workspace_id and f.source = 'social_tile' and f.storage_path is not null
    )) or
    (r.request_key ~ '^social-background:[0-9a-fA-F-]{36}$' and exists (
      select 1 from public.brand_files f where f.workspace_id = r.workspace_id and f.source = 'ai-generated'
        and f.storage_path = r.workspace_id::text || '/social-tile-sources/' || substring(r.request_key from 19) || '.png'
    ))
  );
  get diagnostics resolved = row_count;
  return resolved;
end $$;
revoke all on function public.reconcile_content_credit_completions() from public, anon, authenticated;
grant execute on function public.reconcile_content_credit_completions() to service_role;

select cron.schedule('autosocials-credit-reconciliation', '*/5 * * * *', 'select public.reconcile_content_credit_completions();');
