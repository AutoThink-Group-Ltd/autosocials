-- Durable render admission and fair dispatch. No provider calls or schedule activation.
-- The workspace lock also serializes the existing enqueue_asset_revision allowance check.
create index if not exists render_jobs_active_workspace_created_idx
  on public.render_jobs (workspace_id, created_at)
  where status in ('queued', 'preparing', 'rendering');

create table if not exists public.creative_queue_dispatch (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_claimed_at timestamptz not null default '-infinity'::timestamptz
);
alter table public.creative_queue_dispatch enable row level security;
revoke all on public.creative_queue_dispatch from public, anon, authenticated;
grant select, insert, update, delete on public.creative_queue_dispatch to service_role;

-- Enforce admission for every writer, including legacy revision RPCs. Four is a product
-- limit. The total backlog is bounded so accepted jobs do not accumulate indefinitely.
create or replace function public.guard_creative_render_admission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  clip_limit integer;
  used_clips bigint;
begin
  if new.status not in ('queued', 'preparing', 'rendering') then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('queued', 'preparing', 'rendering')
      and old.workspace_id = new.workspace_id and old.variant_id = new.variant_id then return new; end if;
  end if;
  -- Match admit_creative_render/enqueue_asset_revision: variant, workspace, admission.
  -- Locking the workspace first could deadlock with a caller already holding the variant.
  perform 1 from public.creative_variants v where v.id = new.variant_id and v.workspace_id = new.workspace_id for update;
  if not found then
    raise exception 'Video does not belong to this workspace';
  end if;
  perform 1 from public.workspaces where id = new.workspace_id for update;
  if not found then raise exception 'Workspace not found'; end if;
  if (select count(*) from public.render_jobs j where j.workspace_id = new.workspace_id
    and j.id is distinct from new.id and j.status in ('queued', 'preparing', 'rendering')) >= 4 then
    raise exception 'Four videos are already active for this business. Wait for one to finish before creating more.';
  end if;
  select coalesce(a.monthly_clip_limit, 12) into clip_limit from public.generation_allowances a where a.workspace_id = new.workspace_id;
  clip_limit := coalesce(clip_limit, 12);
  select count(*) into used_clips from public.render_jobs j where j.workspace_id = new.workspace_id
    and j.id is distinct from new.id and j.status <> 'failed'
    and j.created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  if used_clips >= clip_limit then
    raise exception 'This month''s video allowance is used up. A workspace owner can raise it.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1782599951, 1);
  if (select count(*) from public.render_jobs j where j.id is distinct from new.id
    and j.status in ('queued', 'preparing', 'rendering')) >= 128 then
    raise exception 'The production queue is full. Please try again when existing videos finish.';
  end if;
  return new;
end $$;
revoke all on function public.guard_creative_render_admission() from public, anon, authenticated;
grant execute on function public.guard_creative_render_admission() to service_role;
drop trigger if exists guard_creative_render_admission on public.render_jobs;
create trigger guard_creative_render_admission before insert or update of status, workspace_id, variant_id
  on public.render_jobs for each row execute function public.guard_creative_render_admission();

-- Repeated submissions of the same active version return its durable identity.
-- The trusted server still performs provider/voice/brief checks before calling this RPC.
create or replace function public.admit_creative_render(
  _variant_id uuid, _expected_version integer, _user_id uuid, _brief_snapshot jsonb,
  _revision_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.creative_variants%rowtype;
  existing public.render_jobs%rowtype;
  queued_id uuid;
begin
  if _user_id is null then raise exception 'Forbidden'; end if;
  select * into v from public.creative_variants where id = _variant_id for update;
  if not found or not coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) then raise exception 'Forbidden'; end if;
  if _expected_version is null or v.version <> _expected_version then
    raise exception 'This asset changed before production started. Refresh and try again.';
  end if;
  if _brief_snapshot is null or jsonb_typeof(_brief_snapshot) <> 'object'
    or coalesce((_brief_snapshot->>'version')::integer, -1) <> _expected_version then
    raise exception 'A matching production brief snapshot is required';
  end if;
  if length(coalesce(_revision_note, '')) > 1000 then raise exception 'Revision note is too long'; end if;
  select * into existing from public.render_jobs j where j.variant_id = v.id
    and j.status in ('queued', 'preparing', 'rendering') order by j.created_at desc limit 1;
  if found then
    if existing.version is distinct from _expected_version then raise exception 'A different version of this video is already active'; end if;
    return jsonb_build_object('render_id', existing.id, 'reused', true);
  end if;
  insert into public.render_jobs (
    workspace_id, variant_id, status, model, technical_status, creative_status, version,
    created_by, brief_snapshot, revision_note, production_state, phase
  ) values (
    v.workspace_id, v.id, 'queued', 'autotoast-hyperframes', 'pending', 'pending', v.version,
    _user_id, _brief_snapshot || jsonb_build_object('version', v.version, 'review_state', 'draft'),
    _revision_note, jsonb_build_object('engine_version', 1, 'outputs', '{}'::jsonb), 'queued'
  ) returning id into queued_id;
  return jsonb_build_object('render_id', queued_id, 'reused', false);
end $$;
revoke all on function public.admit_creative_render(uuid, integer, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admit_creative_render(uuid, integer, uuid, jsonb, text) to service_role;

-- Preserve the existing revision RPC contract, but reserve its engine job in the same
-- transaction as the new brief/version. A failed admission rolls the brief update back.
create or replace function public.enqueue_asset_revision(
  _variant_id uuid, _expected_version integer, _brief jsonb, _revision_note text, _user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v public.creative_variants%rowtype;
  revised public.creative_variants%rowtype;
  next_version integer;
  queued_id uuid;
  frozen jsonb;
begin
  select * into v from public.creative_variants where id = _variant_id for update;
  if not found or not coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) then raise exception 'Forbidden'; end if;
  if _expected_version is null or v.version <> _expected_version then
    raise exception 'This asset changed while Sam was editing it. Refresh and try again.';
  end if;
  if exists (select 1 from public.render_jobs where variant_id = v.id and status in ('queued', 'preparing', 'rendering')) then
    raise exception 'Sam is already editing this asset. Wait for the current version to finish.';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object'
    or length(coalesce(_revision_note, '')) not between 2 and 1000 then raise exception 'Invalid revision'; end if;
  revised := jsonb_populate_record(v, _brief);
  if length(trim(coalesce(revised.voiceover, ''))) = 0 then raise exception 'Add a voiceover script first.'; end if;
  if revised.duration_s <= 0 or revised.duration_s > 120 then raise exception 'Invalid video duration'; end if;
  perform 1 from public.workspaces where id = v.workspace_id for update;
  select greatest(v.version, coalesce(max(version), 0)) + 1 into next_version from public.render_jobs where variant_id = v.id;
  update public.creative_variants set
    hook = revised.hook, angle = revised.angle, narrative = revised.narrative, argument = revised.argument,
    format = revised.format, beats = revised.beats, voiceover = revised.voiceover, script = revised.script,
    caption = revised.caption, cta = revised.cta, duration_s = revised.duration_s, size = revised.size,
    voice_id = revised.voice_id, file_ids = revised.file_ids, captions = revised.captions,
    composition_html = revised.composition_html, build_prompt = revised.build_prompt,
    build_report = revised.build_report, design_mode = revised.design_mode, opening_visual = revised.opening_visual,
    production_plan = revised.production_plan,
    version = next_version, review_state = case when v.primary_render_id is null then 'needs_revision' else v.review_state end,
    review_note = case when v.primary_render_id is null then _revision_note else v.review_note end
  where id = v.id;
  frozen := public.asset_brief_snapshot(revised) || jsonb_build_object(
    'version', next_version, 'review_state', 'draft', 'review_note', _revision_note, 'production_plan', revised.production_plan
  );
  insert into public.render_jobs (
    workspace_id, variant_id, status, model, version, created_by, brief_snapshot, revision_note,
    production_state, phase, technical_status, creative_status
  ) values (
    v.workspace_id, v.id, 'queued', 'autotoast-hyperframes', next_version, _user_id, frozen, _revision_note,
    jsonb_build_object('engine_version', 1, 'outputs', '{}'::jsonb), 'queued', 'pending', 'pending'
  ) returning id into queued_id;
  return jsonb_build_object('render_id', queued_id, 'version', next_version);
end $$;
revoke all on function public.enqueue_asset_revision(uuid, integer, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_asset_revision(uuid, integer, jsonb, text, uuid) to service_role;

-- One short transaction owns capacity decisions. Provider requests happen after commit.
-- Least-recently-dispatched workspace wins each slot; FIFO is preserved within a workspace.
create or replace function public.claim_creative_render_jobs(
  _max_claims integer default 4, _global_limit integer default 8
) returns setof uuid language plpgsql security definer set search_path = '' as $$
declare
  capacity integer;
  claims integer := 0;
  candidate record;
begin
  if _max_claims is null or _max_claims not between 1 and 64
    or _global_limit is null or _global_limit not between 1 and 64 then
    raise exception 'Invalid production capacity';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1782599951, 2);
  select greatest(0, least(_max_claims, _global_limit - count(*)::integer)) into capacity
    from public.render_jobs j where j.model = 'autotoast-hyperframes' and j.status in ('preparing', 'rendering');
  while claims < capacity loop
    select j.id, j.workspace_id into candidate from public.render_jobs j
      left join public.creative_queue_dispatch d on d.workspace_id = j.workspace_id
      where j.model = 'autotoast-hyperframes' and j.status = 'queued'
        and j.production_state->>'engine_version' = '1'
        and (select count(*) from public.render_jobs active where active.workspace_id = j.workspace_id
          and active.status in ('preparing', 'rendering')) < 4
      order by d.last_claimed_at asc nulls first, j.created_at asc, j.id asc
      for update of j skip locked limit 1;
    exit when not found;
    update public.render_jobs set status = 'preparing', started_at = coalesce(started_at, now()),
      phase = 'designing', phase_claimed_at = now(), updated_at = now() where id = candidate.id and status = 'queued';
    if found then
      insert into public.creative_queue_dispatch(workspace_id, last_claimed_at) values (candidate.workspace_id, clock_timestamp())
        on conflict (workspace_id) do update set last_claimed_at = excluded.last_claimed_at;
      claims := claims + 1;
      return next candidate.id;
    end if;
  end loop;
end $$;
revoke all on function public.claim_creative_render_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_creative_render_jobs(integer, integer) to service_role;
