-- Server-only durable previews. They are records of what was inspected, not
-- authorization to publish. No authenticated client can write or read these.
create table public.agent_publishing_previews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  connection_id uuid not null,
  post_id uuid not null,
  account_id uuid not null,
  scheduled_at timestamptz,
  idempotency_key text,
  request_hash text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (connection_id, idempotency_key)
);
alter table public.agent_publishing_previews enable row level security;
revoke all on public.agent_publishing_previews from public, anon, authenticated;
grant select, insert on public.agent_publishing_previews to service_role;

-- Policies are created by a verified workspace owner; disabled until an
-- atomic queue and dispatch gate can honor every field below.
create table public.agent_publishing_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid not null,
  created_by uuid not null,
  account_ids uuid[] not null check (cardinality(account_ids) > 0),
  expires_at timestamptz not null,
  max_count integer not null check (max_count between 1 and 1000),
  publish_now_account_ids uuid[] not null default '{}',
  publish_now_max_count integer not null default 0 check (publish_now_max_count between 0 and 1000),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (publish_now_account_ids <@ account_ids),
  check ((cardinality(publish_now_account_ids) = 0 and publish_now_max_count = 0) or
         (cardinality(publish_now_account_ids) > 0 and publish_now_max_count > 0))
);
alter table public.agent_publishing_policies enable row level security;
revoke all on public.agent_publishing_policies from public, anon, authenticated;
grant select, insert, update on public.agent_publishing_policies to service_role;

create table public.agent_publishing_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  connection_id uuid not null,
  policy_id uuid not null,
  preview_id uuid not null unique,
  post_id uuid not null unique,
  target_id uuid not null unique,
  request_key text not null,
  request_hash text not null,
  action text not null check (action in ('schedule','publish_now')),
  caption text not null,
  account_id uuid not null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(connection_id, request_key)
);
alter table public.agent_publishing_requests enable row level security;
revoke all on public.agent_publishing_requests from public, anon, authenticated;
grant select, insert, update on public.agent_publishing_requests to service_role;

create function public.queue_agent_linkedin(_workspace uuid, _user uuid, _connection uuid, _preview uuid, _policy uuid, _action text, _key text, _hash text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare c public.agent_api_connections%rowtype; pol public.agent_publishing_policies%rowtype;
 v public.agent_publishing_previews%rowtype; src public.posts%rowtype; req public.agent_publishing_requests%rowtype;
 a public.social_accounts%rowtype; new_post uuid; new_target uuid; when_at timestamptz; required_scope text;
begin
 if _action not in ('schedule','publish_now') or length(_key) not between 1 and 128 then raise exception 'Invalid request'; end if;
 select * into c from public.agent_api_connections where id=_connection for update;
 if not found or c.workspace_id <> _workspace or c.user_id <> _user or c.revoked_at is not null or c.expires_at <= now() then raise exception 'Connection unavailable'; end if;
 required_scope := case when _action='publish_now' then 'posts:publish' else 'posts:schedule' end;
 if not required_scope = any(c.scopes) or not public.is_workspace_member(_user,_workspace) then raise exception 'Permission unavailable'; end if;
 select * into req from public.agent_publishing_requests where connection_id=_connection and request_key=_key;
 if found then
   if req.request_hash <> _hash then raise exception 'Idempotency conflict'; end if;
   return jsonb_build_object('requestId',req.id,'postId',req.post_id,'state','requested','scheduledAt',req.scheduled_at);
 end if;
 select * into pol from public.agent_publishing_policies where id=_policy for update;
 if not found or pol.workspace_id<>_workspace or pol.connection_id<>_connection or pol.revoked_at is not null or pol.expires_at<=now() or not public.is_workspace_owner(pol.created_by,_workspace) then raise exception 'Policy unavailable'; end if;
 select * into v from public.agent_publishing_previews where id=_preview and workspace_id=_workspace and connection_id=_connection and user_id=_user;
 if not found or not v.account_id=any(pol.account_ids) then raise exception 'Preview unavailable'; end if;
 if (select count(*) from public.agent_publishing_requests where policy_id=pol.id)>=pol.max_count then raise exception 'Policy limit reached'; end if;
 if _action='publish_now' and (not v.account_id=any(pol.publish_now_account_ids) or (select count(*) from public.agent_publishing_requests where policy_id=pol.id and action='publish_now')>=pol.publish_now_max_count) then raise exception 'Immediate publishing unavailable'; end if;
 perform 1 from public.workspaces where id=_workspace and not requires_approval for update;
 if not found then raise exception 'Workspace requires team approval'; end if;
 select * into src from public.posts where id=v.post_id and workspace_id=_workspace for update;
 if not found or src.status<>'draft' or src.caption is distinct from v.snapshot->>'caption' or src.first_comment is distinct from v.snapshot->>'firstComment' or src.updated_at is distinct from (v.snapshot->>'postUpdatedAt')::timestamptz then raise exception 'Draft changed'; end if;
 if btrim(src.caption)='' or length(src.caption)>3000 or nullif(btrim(coalesce(src.first_comment,'')),'') is not null or exists(select 1 from public.post_media where post_id=src.id) or exists(select 1 from public.post_targets where post_id=src.id) then raise exception 'Only text-only drafts without destinations can be queued'; end if;
 select * into a from public.social_accounts where id=v.account_id and workspace_id=_workspace for share;
 if not found or a.platform<>'linkedin' or a.status<>'connected' or not a.is_enabled or a.expires_at is null or a.expires_at<=now()+interval '1 minute' then raise exception 'Account unavailable'; end if;
 when_at := case when _action='publish_now' then now() else v.scheduled_at end;
 if when_at is null or (_action='schedule' and when_at<now()+interval '1 minute') then raise exception 'Invalid scheduled time'; end if;
 if when_at >= pol.expires_at or when_at >= c.expires_at then raise exception 'Scheduled time is after authorization expires'; end if;
 if exists(select 1 from public.agent_publishing_requests where preview_id=v.id) then raise exception 'This preview has already been queued'; end if;
 insert into public.posts(workspace_id,created_by,status,caption,scheduled_at) values(_workspace,_user,'draft',src.caption,when_at) returning id into new_post;
 insert into public.post_targets(post_id,social_account_id,platform) values(new_post,a.id,'linkedin') returning id into new_target;
 update public.posts set status='scheduled' where id=new_post;
 insert into public.agent_publishing_requests(workspace_id,user_id,connection_id,policy_id,preview_id,post_id,target_id,request_key,request_hash,action,caption,account_id,scheduled_at)
 values(_workspace,_user,_connection,pol.id,v.id,new_post,new_target,_key,_hash,_action,src.caption,a.id,when_at) returning * into req;
 return jsonb_build_object('requestId',req.id,'postId',new_post,'state','requested','scheduledAt',when_at);
end $$;
revoke all on function public.queue_agent_linkedin(uuid,uuid,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.queue_agent_linkedin(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;

-- The submission marker commits the in-flight boundary. Revocation before this
-- transaction acquires its locks holds the target; after it commits, the network
-- request may already be in flight and cannot be recalled.
create function public.begin_agent_linkedin_dispatch(_target uuid, _lease uuid, _caption text, _first_comment text, _media_count integer, _external_id text)
returns text language plpgsql security invoker set search_path = public as $$
declare r public.agent_publishing_requests%rowtype; c public.agent_api_connections%rowtype; pol public.agent_publishing_policies%rowtype; p public.posts%rowtype; t public.post_targets%rowtype; a public.social_accounts%rowtype; blocked boolean; workspace_ok boolean; member_ok boolean; owner_ok boolean;
begin
 select * into r from public.agent_publishing_requests where target_id=_target;
 if not found then return 'ordinary'; end if;
 select * into c from public.agent_api_connections where id=r.connection_id for update;
 select * into pol from public.agent_publishing_policies where id=r.policy_id for update;
 select * into t from public.post_targets where id=_target for update;
 select * into p from public.posts where id=r.post_id for update;
 select * into a from public.social_accounts where id=r.account_id for share;
 perform 1 from public.workspaces where id=r.workspace_id and not requires_approval for share;
 workspace_ok := found;
 perform 1 from public.workspace_members where user_id=r.user_id and workspace_id=r.workspace_id for share;
 member_ok := found;
 perform 1 from public.workspace_members where user_id=pol.created_by and workspace_id=r.workspace_id and role='owner' for share;
 owner_ok := found;
 if t.lease_token is distinct from _lease or t.status<>'publishing' or t.submission_started_at is not null then raise exception 'Lease unavailable'; end if;
 blocked := c.id is null or pol.id is null or a.id is null or p.id is null or c.revoked_at is not null or c.expires_at<=now() or c.workspace_id<>r.workspace_id or c.user_id<>r.user_id
   or not member_ok
   or not (case when r.action='publish_now' then 'posts:publish' else 'posts:schedule' end)=any(c.scopes)
   or pol.revoked_at is not null or pol.expires_at<=now() or not owner_ok
   or pol.workspace_id<>r.workspace_id or pol.connection_id<>r.connection_id or not r.account_id=any(pol.account_ids)
   or (r.action='publish_now' and not r.account_id=any(pol.publish_now_account_ids))
   or not workspace_ok
   or p.workspace_id<>r.workspace_id or p.status<>'publishing' or p.scheduled_at is distinct from r.scheduled_at or _media_count<>0 or p.caption is distinct from r.caption or _caption is distinct from r.caption
   or nullif(btrim(coalesce(p.first_comment,'')),'') is not null or nullif(btrim(coalesce(_first_comment,'')),'') is not null
   or t.social_account_id<>r.account_id or t.platform<>'linkedin' or t.caption_override is not null or t.first_comment_override is not null
   or exists(select 1 from public.post_media where post_id=p.id)
   or a.workspace_id<>r.workspace_id or a.external_id is distinct from _external_id or a.platform<>'linkedin' or a.status<>'connected' or not a.is_enabled or a.expires_at is null or a.expires_at<=now();
 if blocked then
   update public.post_targets set status='skipped',error='Agent publishing authorization or content changed; held for review.',lease_token=null,lease_expires_at=null,next_retry_at=null where id=_target;
   return 'held';
 end if;
 update public.post_targets set submission_started_at=now() where id=_target;
 return 'started';
end $$;
revoke all on function public.begin_agent_linkedin_dispatch(uuid,uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.begin_agent_linkedin_dispatch(uuid,uuid,text,text,integer,text) to service_role;
