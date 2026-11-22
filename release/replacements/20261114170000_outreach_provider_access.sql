-- The old table policy allowed workspace members to read a SendGrid API key.
-- Keep the existing status-only UI queries working without exposing credentials.
revoke all on public.workspace_sendgrid_config from anon, authenticated;
grant select (id, workspace_id, warmup_stage, sending_paused, pause_reason, created_at, updated_at) on public.workspace_sendgrid_config to authenticated;
grant all on public.workspace_sendgrid_config to service_role;
