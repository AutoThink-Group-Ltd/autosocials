-- Public YouTube API data can be repeated in Sam's prose. Keep recent conversations
-- useful without retaining those snapshots indefinitely. Only new tagged replies
-- expire; unrelated chat history and canvas references remain untouched.
alter table public.agent_messages add column if not exists api_data_expires_at timestamptz;
create index if not exists agent_messages_api_data_expiry_idx
  on public.agent_messages (api_data_expires_at) where api_data_expires_at is not null;

create or replace function public.expire_youtube_research_messages()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.agent_messages
  set content = 'This YouTube research snapshot has expired. Open its Live View gallery or ask Sam to refresh the public information.',
      api_data_expires_at = null
  where api_data_expires_at <= now();
  delete from public.youtube_oauth_pending where expires_at <= now();
end;
$$;
revoke all on function public.expire_youtube_research_messages() from public, anon, authenticated;
grant execute on function public.expire_youtube_research_messages() to service_role;

-- 28 days plus hourly cleanup stays inside the 30-day API-data refresh boundary.
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'youtube-research-retention') then
    perform cron.schedule('youtube-research-retention', '17 * * * *', 'select public.expire_youtube_research_messages()');
  end if;
end $$;
