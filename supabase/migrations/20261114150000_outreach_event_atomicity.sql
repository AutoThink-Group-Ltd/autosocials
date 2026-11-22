create or replace function public.approve_outreach_batch(_batch_id uuid, _workspace_id uuid, _user_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.outreach_batches%rowtype; item jsonb; sender jsonb; actual_name text; actual_signature text;
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 select * into b from public.outreach_batches where id=_batch_id and workspace_id=_workspace_id for update;
 if not found then raise exception 'Review not found'; end if;
 if b.created_by <> _user_id then raise exception 'Only the reviewer can approve this batch'; end if;
 if b.status='approved' then return b.id; end if;
 if b.status <> 'review' then raise exception 'Review is no longer available'; end if;
 sender := b.snapshot->'sender';
 if sender->>'id' is null then
  select coalesce(nullif(s.from_name,''),'AutoSocials'),coalesce(s.signature_text,'') into actual_name,actual_signature from (select 1) x left join public.outreach_sender_settings s on s.workspace_id=_workspace_id;
  if sender->>'email'<>'info@autosocials.com' then raise exception 'Sender changed; review again'; end if;
 else
  select coalesce(nullif(s.from_name,''),i.sender_name), coalesce(s.signature_text,'') into actual_name,actual_signature from public.sender_identities i left join public.outreach_sender_settings s on s.workspace_id=i.workspace_id where i.id=(sender->>'id')::uuid and i.workspace_id=_workspace_id and i.is_verified and lower(i.sender_email)=lower(sender->>'email');
  if not found or not exists(select 1 from public.workspace_domains d where d.workspace_id=_workspace_id and lower(d.domain)=split_part(lower(sender->>'email'),'@',2) and d.status='verified' and d.sendgrid_domain_id is not null) or not exists(select 1 from public.outreach_domain_proofs p where p.workspace_id=_workspace_id and p.domain=split_part(lower(sender->>'email'),'@',2) and p.verified_at is not null) then raise exception 'Sender changed; review again'; end if;
 end if;
 if actual_name<>sender->>'name' or actual_signature<>coalesce(b.snapshot->>'signature','') then raise exception 'Sender changed; review again'; end if;
 if jsonb_array_length(b.snapshot->'creators')=0 then raise exception 'Empty review'; end if;
 for item in select * from jsonb_array_elements(b.snapshot->'creators') loop
  perform 1 from public.outreach_creators c where c.id=(item->>'id')::uuid and c.workspace_id=_workspace_id and c.campaign_id=b.campaign_id and c.version=(item->>'version')::integer and c.email=item->>'email' and c.subject=item->>'subject' and c.body=item->>'body' for update;
  if not found then raise exception 'A draft or recipient changed; review again'; end if;
  if exists(select 1 from public.blocked_contacts where workspace_id=_workspace_id and lower(email)=lower(item->>'email')) then raise exception 'A recipient is suppressed'; end if;
  if exists(select 1 from public.outreach_jobs where creator_id=(item->>'id')::uuid and status in ('queued','claimed','accepted','delivered','ambiguous')) then raise exception 'A message for this creator is already queued or sent'; end if;
 end loop;
 insert into public.outreach_jobs(workspace_id,campaign_id,creator_id,batch_id,sender_identity_id,from_name,from_email,signature,to_email,to_name,subject,body)
 select _workspace_id,b.campaign_id,(x->>'id')::uuid,b.id,(sender->>'id')::uuid,sender->>'name',sender->>'email',coalesce(b.snapshot->>'signature',''),x->>'email',x->>'name',x->>'subject',x->>'body' from jsonb_array_elements(b.snapshot->'creators') x;
 update public.outreach_batches set status='approved',approved_at=now() where id=b.id; return b.id;
end $$;

-- Atomically persist the provider receipt and all effects, so a retry cannot
-- mistake a partially processed event for a completed one.
create function public.apply_outreach_provider_event(_event_id text, _job_id uuid, _workspace_id uuid, _event text) returns boolean
language plpgsql security definer set search_path = public as $$
declare job public.outreach_jobs%rowtype; inserted text;
begin
 if _event not in ('delivered','bounce','dropped','spamreport','unsubscribe','group_unsubscribe') or length(_event_id) not between 1 and 512 then raise exception 'Invalid event'; end if;
 select * into job from public.outreach_jobs where id=_job_id and workspace_id=_workspace_id for update;
 if not found then return false; end if;
 insert into public.outreach_webhook_events(id) values (_event_id) on conflict (id) do nothing returning id into inserted;
 if inserted is null then return false; end if;
 if _event='delivered' then
  update public.outreach_jobs set status='delivered',updated_at=now() where id=job.id and status in ('claimed','accepted','ambiguous');
 else
  update public.outreach_jobs set status='failed',error_message='Provider event: '||_event,updated_at=now() where id=job.id and status in ('claimed','accepted','ambiguous');
  insert into public.blocked_contacts(workspace_id,email,reason,details,blocked_at)
  values (job.workspace_id,lower(job.to_email),_event,'Email provider event',now())
  on conflict (workspace_id,lower(email)) do update set reason=excluded.reason,details=excluded.details,blocked_at=excluded.blocked_at;
 end if;
 return true;
end $$;
revoke all on function public.apply_outreach_provider_event(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_outreach_provider_event(text,uuid,uuid,text) to service_role;
