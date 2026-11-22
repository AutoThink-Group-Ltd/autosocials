-- Transactional, minimum-data events for agent-owned publishing only.
-- Trigger functions are privileged so ordinary target updates do not gain access
-- to the server-only tables. Fixed search path and no user-supplied SQL.
create function public.agent_webhook_publishing_request_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_uuid uuid := gen_random_uuid(); event_name text;
begin
  event_name := case new.action when 'schedule' then 'post.scheduled' else 'post.queued' end;
  insert into public.agent_webhook_deliveries(subscription_id,workspace_id,event_id,event_type,occurred_at,subject_id)
    select s.id,new.workspace_id,event_uuid,event_name,new.created_at,new.post_id
    from public.agent_webhook_subscriptions s
    where s.workspace_id=new.workspace_id and s.enabled and event_name=any(s.event_types)
    on conflict (subscription_id,event_id) do nothing;
  return new;
end $$;
revoke all on function public.agent_webhook_publishing_request_event() from public, anon, authenticated;
create trigger agent_webhook_publishing_request_event after insert on public.agent_publishing_requests
for each row execute function public.agent_webhook_publishing_request_event();

create function public.agent_webhook_publishing_target_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_uuid uuid := gen_random_uuid(); event_name text; r record;
begin
  if new.status is not distinct from old.status then return new; end if;
  event_name := case new.status::text when 'published' then 'post.published' when 'failed' then 'post.failed' when 'skipped' then 'post.held' else null end;
  if event_name is null then return new; end if;
  select workspace_id,post_id into r from public.agent_publishing_requests where target_id=new.id and post_id=new.post_id;
  if not found then return new; end if;
  insert into public.agent_webhook_deliveries(subscription_id,workspace_id,event_id,event_type,occurred_at,subject_id)
    select s.id,r.workspace_id,event_uuid,event_name,now(),r.post_id
    from public.agent_webhook_subscriptions s
    where s.workspace_id=r.workspace_id and s.enabled and event_name=any(s.event_types)
    on conflict (subscription_id,event_id) do nothing;
  return new;
end $$;
revoke all on function public.agent_webhook_publishing_target_event() from public, anon, authenticated;
create trigger agent_webhook_publishing_target_event after update of status on public.post_targets
for each row execute function public.agent_webhook_publishing_target_event();
