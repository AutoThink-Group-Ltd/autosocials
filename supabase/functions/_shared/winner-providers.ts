import { normaliseMeta, normaliseTikTok, normaliseYouTube, observedCount, type Observation } from './winner-normalise.ts';

const graph = 'https://graph.facebook.com/v21.0';
const youtube = 'https://www.googleapis.com/youtube/v3';
export type Account = { id: string; workspace_id: string; platform: string; external_id: string; access_token: string; refresh_token: string | null; expires_at: string | null; scopes: string[] | null; status: string; is_enabled: boolean };
type Imported = Observation & { comments: { text: string }[]; comments_status: string };
export class ProviderFailure extends Error { constructor(message: string, readonly status: 'error' | 'reconnect' | 'unsupported' = 'error') { super(message); } }
export async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  let body: any; try { body = await r.json(); } catch { throw new ProviderFailure('The platform returned an unreadable response.'); }
  if (!r.ok || body?.error && typeof body.error === 'object' && body.error.code && body.error.code !== 'ok') {
    if (r.status === 401 || r.status === 403 || body?.error?.code === 190) throw new ProviderFailure('Access has expired or is missing. Reconnect the account and grant the required permissions.', 'reconnect');
    throw new ProviderFailure('The platform could not provide this page. Try again later.');
  }
  return body;
}
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 1000) : '';
async function mapLimited<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, 5) }, async () => {
    while (next < items.length) { const index = next++; out[index] = await task(items[index]!); }
  }));
  return out;
}
export async function metaPage(account: Account, token: string, cursor: string | null) {
  const ig = account.platform === 'instagram';
  const fields = ig ? 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count' : 'id,message,created_time,full_picture,permalink_url,attachments{media_type,media,title,description,subattachments{media}},reactions.summary(true),comments.summary(true),shares';
  const params = new URLSearchParams({ fields, limit: '25', access_token: token });
  if (cursor) params.set('after', cursor);
  const body = await json(`${graph}/${encodeURIComponent(account.external_id)}/${ig ? 'media' : 'posts'}?${params}`);
  const observations = (body.data ?? []).map((p: any) => normaliseMeta(ig ? 'instagram' : 'facebook', p)).filter((p: Observation | null): p is Observation => !!p);
  const rows: Imported[] = await mapLimited(observations, async (p: Observation) => {
    const getInsights = async () => {
      if (ig ? !account.scopes?.includes('instagram_manage_insights') : !account.scopes?.includes('read_insights')) return;
      const metric = async (name: string) => {
        try {
          const params = new URLSearchParams({ metric: name, access_token: token });
          const result = await json(`${graph}/${encodeURIComponent(p.external_id)}/insights?${params}`);
          return observedCount(result.data?.[0]?.values?.[0]?.value);
        } catch { return null; }
      };
      const [views, reach, shares] = await Promise.all((ig ? ['views', 'reach', 'shares'] : ['post_media_view', 'post_total_media_view_unique']).map(metric));
      p.views = views ?? null; p.reach = reach ?? null;
      if (ig) p.shares = shares ?? null;
    };
    const getComments = async () => {
      try {
        const q = new URLSearchParams({ fields: ig ? 'text' : 'message', limit: '10', access_token: token });
        const c = await json(`${graph}/${encodeURIComponent(p.external_id)}/comments?${q}`);
        return { comments: (c.data ?? []).map((x: any) => ({ text: text(ig ? x.text : x.message) })).filter((x: { text: string }) => x.text), comments_status: 'available' };
      } catch { return { comments: [], comments_status: 'unavailable' }; }
    };
    const [, comments] = await Promise.all([getInsights(), getComments()]);
    return { ...p, ...comments };
  });
  return { rows, cursor: body.paging?.next && typeof body.paging?.cursors?.after === 'string' ? body.paging.cursors.after : null };
}
export async function youtubePage(account: Account, token: string, cursor: string | null) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const channel = await json(`${youtube}/channels?${new URLSearchParams({ part: 'contentDetails', id: account.external_id })}`, auth);
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (typeof uploads !== 'string') throw new ProviderFailure('The connected YouTube channel could not be read.', 'reconnect');
  const q = new URLSearchParams({ part: 'contentDetails', playlistId: uploads, maxResults: '25' });
  if (cursor) q.set('pageToken', cursor);
  const page = await json(`${youtube}/playlistItems?${q}`, auth);
  const ids = (page.items ?? []).map((item: any) => item.contentDetails?.videoId).filter((id: unknown) => typeof id === 'string');
  if (!ids.length) return { rows: [] as Imported[], cursor: page.nextPageToken ?? null };
  const videos = await json(`${youtube}/videos?${new URLSearchParams({ part: 'snippet,statistics', id: ids.join(','), maxResults: '50' })}`, auth);
  const observations = (videos.items ?? []).map(normaliseYouTube).filter((p: Observation | null): p is Observation => !!p);
  const rows: Imported[] = await mapLimited(observations, async (p: Observation) => {
    try {
      const params = new URLSearchParams({ part: 'snippet', videoId: p.external_id, maxResults: '10', textFormat: 'plainText', order: 'relevance' });
      const c = await json(`${youtube}/commentThreads?${params}`, auth);
      return { ...p, comments: (c.items ?? []).map((x: any) => ({ text: text(x.snippet?.topLevelComment?.snippet?.textDisplay) })).filter((x: { text: string }) => x.text), comments_status: 'available' };
    } catch { return { ...p, comments: [], comments_status: 'unavailable' }; }
  });
  return { rows, cursor: typeof page.nextPageToken === 'string' ? page.nextPageToken : null };
}
export async function tiktokPage(token: string, cursor: string | null) {
  const fields = 'id,create_time,cover_image_url,share_url,video_description,title,like_count,comment_count,share_count,view_count';
  const payload: Record<string, number> = { max_count: 20 };
  if (cursor && /^\d+$/.test(cursor)) payload['cursor'] = Number(cursor);
  const body = await json(`https://open.tiktokapis.com/v2/video/list/?${new URLSearchParams({ fields })}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const rows: Imported[] = (body.data?.videos ?? []).map(normaliseTikTok).filter((p: Observation | null): p is Observation => !!p).map((p: Observation) => ({ ...p, comments: [], comments_status: 'unsupported' }));
  return { rows, cursor: body.data?.has_more && Number.isSafeInteger(body.data?.cursor) ? String(body.data.cursor) : null };
}
