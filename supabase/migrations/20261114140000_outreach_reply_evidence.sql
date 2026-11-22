-- Provider-linked replies are audit evidence. Authenticated users may organize or
-- mark them read, but only the ingestion service can create or alter evidence.
create function public.protect_outreach_reply_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
 if current_user in ('anon','authenticated') then
  if tg_op = 'INSERT' then
   if new.outreach_job_id is not null or new.provider_event_id is not null or new.inbound_message_id is not null then
    raise exception 'Outreach reply provenance is managed by the inbound service';
   end if;
  elsif old.outreach_job_id is not null then
   if (to_jsonb(new) - array['is_read','folder_id']) is distinct from (to_jsonb(old) - array['is_read','folder_id']) then
    raise exception 'Outreach reply evidence cannot be edited';
   end if;
  elsif new.outreach_job_id is distinct from old.outreach_job_id or new.provider_event_id is distinct from old.provider_event_id or new.inbound_message_id is distinct from old.inbound_message_id then
   raise exception 'Outreach reply provenance is managed by the inbound service';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.protect_outreach_reply_evidence() from public,anon,authenticated;
create trigger protect_outreach_reply_evidence before insert or update on public.email_replies for each row execute function public.protect_outreach_reply_evidence();
-- Keep legacy deletions available, but preserve linked replies as audit evidence.
create policy outreach_reply_evidence_no_client_delete on public.email_replies as restrictive for delete to authenticated using (outreach_job_id is null and provider_event_id is null and inbound_message_id is null);
