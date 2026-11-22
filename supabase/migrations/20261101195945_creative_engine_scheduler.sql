-- Authenticated continuation of explicitly queued creative jobs. No planning or publishing.
-- Keep inactive until the corresponding production endpoint is deployed and checked.
revoke all on public.internal_job_secrets from anon, authenticated;
insert into public.internal_job_secrets(name,secret)
values ('creative_engine',encode(extensions.gen_random_bytes(32),'hex'))
on conflict (name) do nothing;

create function public.advance_creative_engine_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare job_secret text; worker_url text;
begin
  if not exists (select 1 from public.render_jobs r where r.production_state->>'engine_version' = '1'
    and r.status in ('queued','preparing','rendering')) then return; end if;
  select secret into job_secret from public.internal_job_secrets where name = 'creative_engine';
  if job_secret is null then raise exception 'Creative job authentication is unavailable'; end if;
  SELECT NULLIF(btrim(decrypted_secret), '') INTO worker_url
  FROM vault.decrypted_secrets WHERE name = 'creative_jobs_url';
  IF worker_url IS NULL THEN RETURN; END IF;
  perform net.http_post(url := worker_url,
    body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-creative-secret',job_secret),
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.advance_creative_engine_jobs() from public,anon,authenticated;
grant execute on function public.advance_creative_engine_jobs() to service_role;

do $$
declare schedule_id bigint;
begin
  select cron.schedule('autosocials-creative-engine','*/2 * * * *','select public.advance_creative_engine_jobs();') into schedule_id;
  perform cron.alter_job(schedule_id,active := false);
end $$;
