import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { decryptMetaToken } from './meta-tokens.ts';
import { decryptYouTubeToken, encryptYouTubeToken, youtubeTokenContext } from './youtube-tokens.ts';
import { feedCount } from './youtube-tiktok-feed-values.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function serveAccountFeed(platform: 'youtube' | 'tiktok') {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response(null, { headers });
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    try {
      const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return reply({ error: 'Unauthorized' }, 401);
      let input: any; try { input = await req.json(); } catch { return reply({ error: 'Invalid request' }, 400); }
      if (typeof input?.social_account_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.social_account_id)) return reply({ error: 'Invalid account' }, 400);
      if (input.cursor != null && (typeof input.cursor !== 'string' || input.cursor.length > 4096 || (platform === 'tiktok' && (!/^\d+$/.test(input.cursor) || !Number.isSafeInteger(Number(input.cursor)))))) return reply({ error: 'Invalid feed cursor' }, 400);
      const admin = createClient(url, service);
      const { data: account, error } = await admin.from('social_accounts').select('id,workspace_id,platform,external_id,handle,display_name,avatar_url,access_token,refresh_token,expires_at,scopes,status,is_enabled').eq('id', input.social_account_id).eq('platform', platform).maybeSingle();
      if (error || !account) return reply({ error: 'Account not found' }, 404);
      const membership = await admin.rpc('can_access_workspace', { _user_id: user.id, _workspace_id: account.workspace_id });
      if (membership.error || !membership.data) return reply({ error: 'Forbidden' }, 403);
      if (account.status !== 'connected' || !account.is_enabled) return reply({ error: 'Reconnect this account to view its posts.' }, 400);
      if (platform === 'tiktok' && !account.scopes?.includes('video.list')) return reply({ error: 'TikTok posts require the video.list permission and TikTok approval. Reconnect with analytics access when available.' }, 403);
      const context = platform === 'youtube' ? youtubeTokenContext(account.workspace_id, account.external_id, 'access') : `account:${account.workspace_id}:tiktok:${account.external_id}`;
      let token = platform === 'youtube' ? await decryptYouTubeToken(account.access_token, context) : await decryptMetaToken(account.access_token, context);
      if (account.expires_at && Date.parse(account.expires_at) <= Date.now() + 60_000) {
        // TikTok rotates refresh tokens. winner-sync can refresh concurrently, so
        // this read-only endpoint must not independently consume that credential.
        if (platform === 'tiktok') return reply({ error: 'TikTok access has expired. Reconnect the account or sync its analytics to refresh access.' }, 401);
        if (!account.refresh_token) return reply({ error: `Reconnect ${platform === 'youtube' ? 'YouTube' : 'TikTok'} to refresh access.` }, 401);
        const refresh = await decryptYouTubeToken(account.refresh_token, youtubeTokenContext(account.workspace_id, account.external_id, 'refresh'));
        const params = { client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '', client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '', refresh_token: refresh, grant_type: 'refresh_token' };
        const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(12000) });
        const refreshed = await response.json();
        if (!response.ok || typeof refreshed.access_token !== 'string') return reply({ error: 'Reconnect YouTube to refresh access.' }, 401);
        token = refreshed.access_token;
        const patch = { access_token: await encryptYouTubeToken(token, context), expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString() };
        const saved = await admin.from('social_accounts').update(patch).eq('id', account.id).eq('workspace_id', account.workspace_id).eq('access_token', account.access_token).select('id').maybeSingle();
        if (saved.error || !saved.data) return reply({ error: 'Account access changed while refreshing. Please retry.' }, 409);
      }
      const auth = { Authorization: `Bearer ${token}` };
      const request = async (address: string, init: RequestInit = {}) => {
        const res = await fetch(address, { ...init, signal: AbortSignal.timeout(12000) });
        const body = await res.json();
        if (!res.ok || (body.error?.code && body.error.code !== 'ok')) throw new Error('provider');
        return body;
      };
      let feedProfile = { handle: account.handle ?? account.display_name ?? '', display_name: account.display_name ?? account.handle ?? '', avatar_url: account.avatar_url ?? null, platform };
      if (platform === 'tiktok') {
        try {
          const profile = await request('https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name', { headers: auth });
          const info = profile.data?.user;
          if (info) feedProfile = { ...feedProfile, display_name: typeof info.display_name === 'string' && info.display_name ? info.display_name : feedProfile.display_name, avatar_url: typeof info.avatar_url === 'string' && info.avatar_url ? info.avatar_url : feedProfile.avatar_url };
        } catch { /* A missing profile must not prevent the user's feed from loading. */ }
      }
      let posts: any[] = [], nextCursor: string | null = null;
      if (platform === 'youtube') {
        const base = 'https://www.googleapis.com/youtube/v3';
        const channel = await request(`${base}/channels?${new URLSearchParams({ part: 'contentDetails', id: account.external_id })}`, { headers: auth });
        const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (typeof uploads !== 'string') throw new Error('provider');
        const query = new URLSearchParams({ part: 'contentDetails', playlistId: uploads, maxResults: '25' });
        if (input.cursor) query.set('pageToken', input.cursor);
        const page = await request(`${base}/playlistItems?${query}`, { headers: auth });
        nextCursor = typeof page.nextPageToken === 'string' ? page.nextPageToken : null;
        const ids = (page.items ?? []).map((item: any) => item.contentDetails?.videoId).filter((id: unknown) => typeof id === 'string');
        if (ids.length) {
          const result = await request(`${base}/videos?${new URLSearchParams({ part: 'snippet,statistics', id: ids.join(',') })}`, { headers: auth });
          const byId = new Map((result.items ?? []).map((item: any) => [item.id, item]));
          posts = ids.map((id: string) => byId.get(id) as any).filter(Boolean).map((video: any) => ({ id: video.id, platform, caption: [video.snippet?.title, video.snippet?.description].filter(Boolean).join('\n\n'), media_type: 'video', media_url: null, thumbnail_url: video.snippet?.thumbnails?.high?.url ?? video.snippet?.thumbnails?.default?.url ?? null, permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, timestamp: video.snippet?.publishedAt, like_count: feedCount(video.statistics?.likeCount), comment_count: feedCount(video.statistics?.commentCount), share_count: null }));
        }
      } else {
        const fields = 'id,create_time,cover_image_url,share_url,video_description,title,like_count,comment_count,share_count';
        const payload: Record<string, number> = { max_count: 20 }; if (input.cursor) payload.cursor = Number(input.cursor);
        const result = await request(`https://open.tiktokapis.com/v2/video/list/?${new URLSearchParams({ fields })}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        nextCursor = result.data?.has_more && Number.isSafeInteger(result.data?.cursor) ? String(result.data.cursor) : null;
        posts = (result.data?.videos ?? []).filter((video: any) => typeof video.id === 'string' && Number.isFinite(video.create_time)).map((video: any) => ({ id: video.id, platform, caption: video.video_description || video.title || '', media_type: 'video', media_url: null, thumbnail_url: video.cover_image_url ?? null, permalink: video.share_url ?? null, timestamp: new Date(video.create_time * 1000).toISOString(), like_count: feedCount(video.like_count), comment_count: feedCount(video.comment_count), share_count: feedCount(video.share_count) }));
      }
      const current = await admin.from('social_accounts').select('status,is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
      if (current.error || !current.data || current.data.status !== 'connected' || !current.data.is_enabled) return reply({ error: 'This account was disconnected. Reconnect to view its posts.' }, 403);
      return reply({ account: feedProfile, posts, next_cursor: nextCursor, fetched_at: new Date().toISOString() });
    } catch { return reply({ error: `Could not load ${platform === 'youtube' ? 'YouTube' : 'TikTok'} posts. Check the account connection and permissions, then try again.` }, 502); }
  });
}
