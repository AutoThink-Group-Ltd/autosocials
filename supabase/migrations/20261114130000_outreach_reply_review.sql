alter table public.email_replies add column if not exists inbound_message_id text;
alter table public.outreach_jobs add column if not exists in_reply_to_message_id text, add column if not exists in_reply_to_reply_id uuid references public.email_replies(id);
create unique index if not exists outreach_one_reply_per_inbound on public.outreach_jobs(in_reply_to_reply_id) where in_reply_to_reply_id is not null;
create table public.outreach_reply_reviews (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 reply_id uuid not null unique references public.email_replies(id), created_by uuid not null, snapshot jsonb not null,
 version integer not null default 1, status text not null default 'review' check (status in ('review','approved')), created_at timestamptz not null default now(), approved_at timestamptz
);
alter table public.outreach_reply_reviews enable row level security;
create policy outreach_reply_reviews_read on public.outreach_reply_reviews for select to authenticated using (public.can_access_workspace(auth.uid(),workspace_id));
create function public.approve_outreach_reply(_review_id uuid, _workspace_id uuid, _user_id uuid, _version integer) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.outreach_reply_reviews%rowtype; incoming public.email_replies%rowtype; original public.outreach_jobs%rowtype; s jsonb; batch uuid; actual_name text; actual_signature text;
begin
 if not coalesce(public.can_access_workspace(_user_id,_workspace_id),false) then raise exception 'Forbidden'; end if;
 select * into r from public.outreach_reply_reviews where id=_review_id and workspace_id=_workspace_id for update;
 if not found or r.created_by<>_user_id then raise exception 'Review unavailable'; end if;
 if r.version<>_version then raise exception 'Review changed; review again'; end if;
 if r.status='approved' then return (select batch_id from public.outreach_jobs where in_reply_to_reply_id=r.reply_id); end if;
 select * into incoming from public.email_replies where id=r.reply_id and workspace_id=_workspace_id for update;
 if not found then raise exception 'Reply unavailable'; end if;
 select * into original from public.outreach_jobs where id=incoming.outreach_job_id and workspace_id=_workspace_id for update;
 if not found or original.status not in ('accepted','delivered') then raise exception 'Original message unavailable'; end if;
 s:=r.snapshot;
 if lower(incoming.from_email)<>lower(original.to_email) or lower(incoming.from_email)<>lower(s->>'to_email') then raise exception 'Reply sender does not match the recipient'; end if;
 if incoming.inbound_message_id is null or incoming.inbound_message_id<>s->>'in_reply_to' or incoming.inbound_message_id !~ '^<[^<>[:space:]]+>$' then raise exception 'Reply threading information unavailable'; end if;
 if original.from_email<>s->>'from_email' or original.from_name<>s->>'from_name' or coalesce(original.sender_identity_id::text,'')<>coalesce(s->>'sender_identity_id','') then raise exception 'Original sender changed'; end if;
 if exists(select 1 from public.blocked_contacts where workspace_id=_workspace_id and lower(email)=lower(incoming.from_email)) then raise exception 'Recipient suppressed'; end if;
 if original.sender_identity_id is null then
  select coalesce(nullif(x.from_name,''),'AutoSocials'),coalesce(x.signature_text,'') into actual_name,actual_signature from (select 1) a left join public.outreach_sender_settings x on x.workspace_id=_workspace_id;
  if original.from_email<>'info@autosocials.com' then raise exception 'Sender unavailable'; end if;
 else
  select coalesce(nullif(x.from_name,''),i.sender_name),coalesce(x.signature_text,'') into actual_name,actual_signature from public.sender_identities i left join public.outreach_sender_settings x on x.workspace_id=i.workspace_id where i.id=original.sender_identity_id and i.workspace_id=_workspace_id and i.is_verified and lower(i.sender_email)=lower(original.from_email);
  if not found or not exists(select 1 from public.workspace_domains d where d.workspace_id=_workspace_id and lower(d.domain)=split_part(lower(original.from_email),'@',2) and d.status='verified' and d.sendgrid_domain_id is not null) or not exists(select 1 from public.outreach_domain_proofs p where p.workspace_id=_workspace_id and p.domain=split_part(lower(original.from_email),'@',2) and p.verified_at is not null) then raise exception 'Sender unavailable'; end if;
 end if;
 if actual_name<>s->>'from_name' or actual_signature<>s->>'signature' then raise exception 'Sender settings changed; prepare review again'; end if;
 if coalesce(length(trim(s->>'body')),0)=0 or coalesce(length(trim(s->>'subject')),0)=0 then raise exception 'Reply is empty'; end if;
 insert into public.outreach_batches(workspace_id,campaign_id,created_by,snapshot,status,approved_at) values (_workspace_id,original.campaign_id,_user_id,jsonb_build_object('reply_review_id',r.id),'approved',now()) returning id into batch;
 insert into public.outreach_jobs(workspace_id,campaign_id,creator_id,batch_id,sender_identity_id,from_name,from_email,signature,to_email,to_name,subject,body,in_reply_to_message_id,in_reply_to_reply_id)
 values (_workspace_id,original.campaign_id,original.creator_id,batch,original.sender_identity_id,s->>'from_name',s->>'from_email',s->>'signature',s->>'to_email',s->>'to_name',s->>'subject',s->>'body',s->>'in_reply_to',incoming.id);
 update public.outreach_reply_reviews set status='approved',approved_at=now() where id=r.id;
 return batch;
end $$;
revoke all on function public.approve_outreach_reply(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.approve_outreach_reply(uuid,uuid,uuid,integer) to service_role;

