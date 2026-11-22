-- Sam may add source titles/credits to ordinary table/text blocks beside a gallery.
-- Expire those snapshots too, retaining only IDs for fresh official API retrieval.
alter table public.canvases add column if not exists api_data_expires_at timestamptz;
create index if not exists canvases_api_data_expiry_idx on public.canvases(api_data_expires_at)
  where api_data_expires_at is not null;
update public.canvases set api_data_expires_at = now() + interval '28 days'
where api_data_expires_at is null and jsonb_path_exists(blocks, '$[*] ? (@.type == "youtube_gallery")');

create or replace function public.expire_youtube_research_messages()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.agent_messages
  set content = 'This YouTube research snapshot has expired. Open its Live View gallery or ask Sam to refresh the public information.', api_data_expires_at = null
  where api_data_expires_at <= now();
  update public.canvases c set title = 'Saved YouTube references',
    blocks = jsonb_build_array(jsonb_build_object('type','notice','tone','info','text','This research snapshot expired. Video details refresh from YouTube; ask Sam to refresh the comparison.'))
      || coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type','youtube_gallery',
        'title','YouTube references','query','Saved video references','video_ids',b->'video_ids','selected_video_id',b->'selected_video_id')))
        from jsonb_array_elements(c.blocks) b where b->>'type' = 'youtube_gallery'), '[]'::jsonb),
    api_data_expires_at = null, version = version + 1, updated_at = now(), updated_by = 'sam'
  where api_data_expires_at <= now();
  delete from public.youtube_oauth_pending where expires_at <= now();
end;
$$;
revoke all on function public.expire_youtube_research_messages() from public, anon, authenticated;
grant execute on function public.expire_youtube_research_messages() to service_role;
