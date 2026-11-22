-- Agent research deduplication: nullable fields preserve existing browser runs.
-- Keep the opaque connection ID as historical attribution after a grant is removed.
alter table public.research_runs
  add column agent_connection_id uuid,
  add column agent_idempotency_key text,
  add column agent_request_hash text,
  add constraint research_agent_request_fields check (
    (agent_connection_id is null and agent_idempotency_key is null and agent_request_hash is null)
    or (agent_connection_id is not null and agent_idempotency_key is not null and agent_request_hash is not null and length(agent_idempotency_key) between 1 and 128 and agent_request_hash ~ '^[0-9a-f]{64}$')
  );
create unique index research_runs_agent_idempotency_idx on public.research_runs(agent_connection_id,agent_idempotency_key)
  where agent_connection_id is not null;
