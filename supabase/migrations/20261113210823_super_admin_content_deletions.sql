-- Permanent media deletions span Postgres and object storage. Keep the work durable
-- so an interrupted storage call can be retried without losing the original path.
create table public.admin_content_deletions (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  kind text not null check (kind in ('video','tile')),
  workspace_id uuid not null,
  render_id uuid,
  file_id uuid,
  signature text,
  storage_path text,
  provider_job_id text,
  provider_verified boolean not null default false,
  claim_token uuid,
  claimed_at timestamptz,
  state text not null default 'pending' check (state in ('pending','completed')),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.admin_content_deletions enable row level security;
revoke all on public.admin_content_deletions from public, anon, authenticated;
grant all on public.admin_content_deletions to service_role;
create unique index admin_content_deletions_pending_path on public.admin_content_deletions(storage_path) where state = 'pending' and storage_path is not null;
create unique index admin_content_deletions_pending_request on public.admin_content_deletions(workspace_id,signature) where state = 'pending' and signature is not null;
create unique index admin_content_deletions_pending_file on public.admin_content_deletions(file_id) where state = 'pending' and file_id is not null;
create unique index admin_content_deletions_pending_render on public.admin_content_deletions(render_id) where state = 'pending' and render_id is not null;

-- Serialize new storage references with enqueue and block them until deletion completes.
create function public.guard_pending_content_deletion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.storage_path is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.storage_path, 0));
    if exists (select 1 from public.admin_content_deletions d where d.storage_path = new.storage_path and d.state = 'pending') then
      raise exception 'This media is being permanently deleted';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_pending_content_deletion() from public, anon, authenticated;
create trigger guard_deleting_media_post before insert or update of storage_path on public.post_media for each row execute function public.guard_pending_content_deletion();
create trigger guard_deleting_media_file before insert or update of storage_path on public.brand_files for each row execute function public.guard_pending_content_deletion();
create trigger guard_deleting_media_render before insert or update of storage_path on public.render_jobs for each row execute function public.guard_pending_content_deletion();

create function public.guard_deleting_creative_references() returns trigger language plpgsql security definer set search_path = '' as $$
declare candidate record;
begin
  for candidate in select f.id, f.storage_path from public.brand_files f
    where f.workspace_id = new.workspace_id and (f.id = any(coalesce(new.file_ids, array[]::uuid[])) or position(to_jsonb(f.id::text)::text in coalesce(new.production_plan, '{}'::jsonb)::text) > 0)
    order by f.storage_path loop
    perform pg_advisory_xact_lock(hashtextextended(candidate.storage_path, 0));
    if exists (select 1 from public.admin_content_deletions d where d.state='pending' and d.storage_path=candidate.storage_path) then raise exception 'This media is being permanently deleted'; end if;
  end loop;
  if new.primary_render_id is not null and exists(select 1 from public.admin_content_deletions d where d.state='pending' and d.render_id=new.primary_render_id) then raise exception 'This video is being permanently deleted'; end if;
  return new;
end $$;
revoke all on function public.guard_deleting_creative_references() from public, anon, authenticated;
create trigger guard_deleting_creative_references before insert or update of file_ids, production_plan, primary_render_id on public.creative_variants for each row execute function public.guard_deleting_creative_references();

create function public.guard_deleting_render_references() returns trigger language plpgsql security definer set search_path = '' as $$
declare candidate record;
begin
  if new.status in ('queued','preparing','rendering') then
    for candidate in select f.id, f.storage_path from public.brand_files f where f.workspace_id=new.workspace_id and
      (position(to_jsonb(f.id::text)::text in coalesce(new.brief_snapshot,'{}'::jsonb)::text)>0 or position(to_jsonb(f.id::text)::text in coalesce(new.production_state,'{}'::jsonb)::text)>0) order by f.storage_path loop
      perform pg_advisory_xact_lock(hashtextextended(candidate.storage_path, 0));
      if exists(select 1 from public.admin_content_deletions d where d.state='pending' and d.storage_path=candidate.storage_path) then raise exception 'This media is being permanently deleted'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.guard_deleting_render_references() from public, anon, authenticated;
create trigger guard_deleting_render_references before insert or update of status, brief_snapshot, production_state on public.render_jobs for each row execute function public.guard_deleting_render_references();

create function public.guard_deleting_operation_reference() returns trigger language plpgsql security definer set search_path = '' as $$
declare candidate record;
begin
  if new.kind='postcard-social-tile' and new.result->>'file_id' is not null then
    select f.storage_path into candidate from public.brand_files f where f.workspace_id=new.workspace_id and f.id::text=new.result->>'file_id';
    if found then
      perform pg_advisory_xact_lock(hashtextextended(candidate.storage_path, 0));
      if exists(select 1 from public.admin_content_deletions d where d.state='pending' and d.storage_path=candidate.storage_path) then raise exception 'This media is being permanently deleted'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_deleting_operation_reference() from public, anon, authenticated;
create trigger guard_deleting_operation_reference before insert or update of result on public.brand_work_operations for each row execute function public.guard_deleting_operation_reference();

create function public.enqueue_admin_content_deletion(p_actor uuid, p_kind text, p_workspace uuid, p_target text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.render_jobs%rowtype; f public.brand_files%rowtype; o public.brand_work_operations%rowtype; out_id uuid; fid uuid; p text;
begin
  if public.has_role(p_actor, 'super_admin') is distinct from true then raise exception 'Forbidden'; end if;
  if p_kind = 'video' then
    select * into r from public.render_jobs where id = p_target::uuid and workspace_id = p_workspace and status = 'done' for update;
    if not found or r.storage_path is null then raise exception 'Video is unavailable'; end if;
    p := r.storage_path;
  elsif p_kind = 'tile' then
    if p_target like 'file:%' then
      fid := substring(p_target from 6)::uuid;
    elsif p_target like 'request:%' then
      select * into o from public.brand_work_operations where workspace_id = p_workspace and kind = 'postcard-social-tile' and signature = substring(p_target from 9) for update;
      if not found then raise exception 'Request is unavailable'; end if;
      if o.status = 'running' then raise exception 'A running request cannot be deleted'; end if;
      if o.result->>'file_id' is not null then fid := (o.result->>'file_id')::uuid; end if;
    else raise exception 'Invalid tile selection'; end if;
    if fid is not null then
      select * into f from public.brand_files where id = fid and workspace_id = p_workspace and source = 'social_tile' and kind = 'image' for update;
      if not found then raise exception 'Saved tile is unavailable'; end if;
      p := f.storage_path;
      if exists (select 1 from public.brand_work_operations where workspace_id=p_workspace and kind='postcard-social-tile' and result->>'file_id'=fid::text and status='running') then raise exception 'A running request cannot be deleted'; end if;
    end if;
  else raise exception 'Invalid content type'; end if;
  if p is not null then
    if p like 'autotoast:%' then
      if p_kind <> 'video' or substring(p from 11) !~ '^[a-zA-Z0-9_-]{1,100}$' then raise exception 'Invalid media reference'; end if;
    elsif p not like p_workspace::text || '/%' or p ~ '[\\?#]' or position('..' in p)>0 or position('//' in p)>0 or right(p,1)='/' then
      raise exception 'Invalid media path';
    elsif p_kind='tile' and p not like p_workspace::text || '/social-tiles/%' then
      raise exception 'Invalid tile path';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p, 0));
    if exists (select 1 from public.post_media where storage_path = p) then raise exception 'Asset is used by a post and cannot be deleted'; end if;
    if exists (select 1 from public.render_jobs where storage_path = p and (p_kind <> 'video' or id <> r.id)) then raise exception 'Asset is shared by another video'; end if;
    if exists (select 1 from public.brand_files where storage_path = p and not ((p_kind = 'video' and source = 'render' and workspace_id = p_workspace) or (p_kind = 'tile' and id = fid))) then raise exception 'Asset is shared by another file'; end if;
    if exists (select 1 from public.brand_files bf join public.creative_variants cv on cv.workspace_id=bf.workspace_id and (bf.id=any(coalesce(cv.file_ids,array[]::uuid[])) or position(to_jsonb(bf.id::text)::text in coalesce(cv.production_plan,'{}'::jsonb)::text)>0) where bf.storage_path=p) then raise exception 'Asset is used by a creative'; end if;
    if exists (select 1 from public.brand_files bf join public.render_jobs active on active.workspace_id=bf.workspace_id and active.status in ('queued','preparing','rendering') and (position(to_jsonb(bf.id::text)::text in coalesce(active.brief_snapshot,'{}'::jsonb)::text)>0 or position(to_jsonb(bf.id::text)::text in coalesce(active.production_state,'{}'::jsonb)::text)>0) where bf.storage_path=p) then raise exception 'Asset is used by an active render'; end if;
  end if;
  insert into public.admin_content_deletions(requested_by,kind,workspace_id,render_id,file_id,signature,storage_path,provider_job_id)
    values(p_actor,p_kind,p_workspace,r.id,fid,o.signature,p,r.provider_job_id) returning id into out_id;
  return out_id;
end $$;
revoke all on function public.enqueue_admin_content_deletion(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.enqueue_admin_content_deletion(uuid,text,uuid,text) to service_role;

create function public.claim_admin_content_deletion(p_kind text, p_exclude uuid[]) returns public.admin_content_deletions language plpgsql security invoker set search_path = '' as $$
declare d public.admin_content_deletions%rowtype;
begin
  select * into d from public.admin_content_deletions where kind=p_kind and state='pending'
    and (claimed_at is null or claimed_at < now() - interval '5 minutes') and not (id = any(coalesce(p_exclude,array[]::uuid[])))
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.admin_content_deletions set claim_token=gen_random_uuid(), claimed_at=now() where id=d.id returning * into d;
  return d;
end $$;
revoke all on function public.claim_admin_content_deletion(text,uuid[]) from public, anon, authenticated;
grant execute on function public.claim_admin_content_deletion(text,uuid[]) to service_role;

create function public.finish_admin_content_deletion(p_id uuid, p_claim uuid) returns void language plpgsql security invoker set search_path = '' as $$
declare d public.admin_content_deletions%rowtype;
begin
  select * into d from public.admin_content_deletions where id = p_id for update;
  if not found then raise exception 'Deletion request not found'; end if;
  if d.state = 'completed' then return; end if;
  if d.claim_token is distinct from p_claim or p_claim is null then raise exception 'Deletion claim expired'; end if;
  if d.storage_path is not null then perform pg_advisory_xact_lock(hashtextextended(d.storage_path, 0)); end if;
  if d.kind = 'video' then
    update public.generation_steps set output_storage_path = null where render_job_id = d.render_id and output_storage_path = d.storage_path;
    delete from public.brand_files where workspace_id = d.workspace_id and storage_path = d.storage_path and source = 'render';
    delete from public.render_jobs where id = d.render_id and workspace_id = d.workspace_id;
  else
    if d.file_id is not null then
      delete from public.brand_work_operations where workspace_id = d.workspace_id and kind = 'postcard-social-tile' and result->>'file_id' = d.file_id::text;
      delete from public.brand_files where id = d.file_id and workspace_id = d.workspace_id and source = 'social_tile';
    end if;
    if d.signature is not null then delete from public.brand_work_operations where workspace_id = d.workspace_id and kind = 'postcard-social-tile' and signature = d.signature; end if;
  end if;
  update public.admin_content_deletions set state='completed', completed_at=now(), last_error=null, storage_path=null, claim_token=null, claimed_at=null where id=p_id;
end $$;
revoke all on function public.finish_admin_content_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.finish_admin_content_deletion(uuid,uuid) to service_role;
