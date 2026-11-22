// Fetches the most recent ~25 posts for a connected Facebook Page or
// Instagram Business account, normalised into a single feed shape so the
// UI can render an FB/IG-style feed natively in-app.

import { decryptMetaToken } from '../_shared/meta-tokens.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH = 'https://graph.facebook.com/v21.0';

interface NormalisedPost {
  id: string;
  platform: 'facebook' | 'instagram';
  caption: string;
  media_type: 'image' | 'video' | 'carousel' | 'text';
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string;
  like_count: number;
  comment_count: number;
  share_count: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { social_account_id, cursor } = await req.json();
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4096)) return json({ error: 'Invalid feed cursor' }, 400);
    if (!social_account_id) return json({ error: 'social_account_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: account, error: accErr } = await admin
      .from('social_accounts')
      .select('*')
      .eq('id', social_account_id)
      .maybeSingle();
    if (accErr || !account) return json({ error: 'Account not found' }, 404);

    const { data: isMember } = await admin.rpc('can_access_workspace', {
      _user_id: user.id,
      _workspace_id: account.workspace_id,
    });
    if (!isMember) return json({ error: 'Forbidden' }, 403);

    const token = await decryptMetaToken(account.access_token as string, `account:${account.workspace_id}:${account.platform}:${account.external_id}`);
    const posts: NormalisedPost[] = [];
    let nextCursor: string | null = null;
    const pageQuery = cursor ? "&after=" + encodeURIComponent(cursor) : "";
    const account_meta = {
      handle: account.handle ?? account.display_name ?? '',
      display_name: account.display_name ?? account.handle ?? '',
      avatar_url: account.avatar_url ?? null as string | null,
      platform: account.platform as 'facebook' | 'instagram',
    };

    if (account.platform === 'facebook') {
      // Repair older connections that were saved without a Page picture.
      if (!account_meta.avatar_url) {
        try {
          const params = new URLSearchParams({ fields: 'picture.width(200).height(200)', access_token: token });
          const picRes = await fetch(`${GRAPH}/${encodeURIComponent(account.external_id)}?${params}`);
          if (picRes.ok) {
            const pic = await picRes.json();
            const avatar = pic?.picture?.data?.url;
            if (typeof avatar === 'string' && avatar) {
              account_meta.avatar_url = avatar;
              await admin.from('social_accounts').update({ avatar_url: avatar }).eq('id', account.id).eq('workspace_id', account.workspace_id).is('avatar_url', null);
            }
          }
        } catch { /* Keep the feed usable when Meta cannot provide a picture. */ }
      }
      const fields = [
        'id', 'message', 'created_time', 'full_picture', 'permalink_url',
        'attachments{media_type,media,subattachments}',
        'reactions.summary(true)', 'comments.summary(true)', 'shares',
      ].join(',');
      const url = `${GRAPH}/${account.external_id}/posts?fields=${fields}&limit=25${pageQuery}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) return json({ error: body?.error?.message ?? 'Facebook error' }, 502);
      nextCursor = body.paging?.next ? body.paging?.cursors?.after ?? null : null;

      for (const p of (body.data ?? [])) {
        const att = p.attachments?.data?.[0];
        const subs = att?.subattachments?.data ?? [];
        let media_type: NormalisedPost['media_type'] = p.full_picture ? 'image' : 'text';
        if (subs.length > 1) media_type = 'carousel';
        else if (att?.media_type === 'video') media_type = 'video';
        posts.push({
          id: p.id,
          platform: 'facebook',
          caption: p.message ?? '',
          media_type,
          media_url: att?.media?.image?.src ?? p.full_picture ?? null,
          thumbnail_url: p.full_picture ?? null,
          permalink: p.permalink_url ?? null,
          timestamp: p.created_time,
          like_count: p.reactions?.summary?.total_count ?? 0,
          comment_count: p.comments?.summary?.total_count ?? 0,
          share_count: p.shares?.count ?? 0,
        });
      }
    } else if (account.platform === 'instagram') {
      const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
      const url = `${GRAPH}/${account.external_id}/media?fields=${fields}&limit=25${pageQuery}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) return json({ error: body?.error?.message ?? 'Instagram error' }, 502);
      nextCursor = body.paging?.next ? body.paging?.cursors?.after ?? null : null;

      if (!account_meta.avatar_url) {
        try {
          const picRes = await fetch(`${GRAPH}/${account.external_id}?fields=profile_picture_url,username,name&access_token=${token}`);
          const pic = await picRes.json();
          account_meta.avatar_url = pic?.profile_picture_url ?? null;
        } catch {}
      }

      for (const m of (body.data ?? [])) {
        const t = (m.media_type ?? '').toLowerCase();
        const media_type: NormalisedPost['media_type'] =
          t === 'video' ? 'video' : t === 'carousel_album' ? 'carousel' : 'image';
        posts.push({
          id: m.id,
          platform: 'instagram',
          caption: m.caption ?? '',
          media_type,
          media_url: m.media_url ?? m.thumbnail_url ?? null,
          thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
          permalink: m.permalink ?? null,
          timestamp: m.timestamp,
          like_count: m.like_count ?? 0,
          comment_count: m.comments_count ?? 0,
          share_count: 0,
        });
      }
    } else {
      return json({ error: 'Unsupported platform' }, 400);
    }

    return json({ account: account_meta, posts, next_cursor: nextCursor, fetched_at: new Date().toISOString() });
  } catch (e) {
    console.error('meta-fetch-feed failed');
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
