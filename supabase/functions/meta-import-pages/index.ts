// Imports user-selected Facebook Pages (and any linked Instagram Business
// accounts) from a meta_oauth_pending row into social_accounts.

import { assertMetaTokenKey, decryptMetaToken, encryptMetaToken, isEncryptedMetaToken } from '../_shared/meta-tokens.ts';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingPage {
  id: string;
  name: string;
  access_token: string;
  token_expires_at?: string | null;
  tasks?: string[];
  granted_scopes?: string[];
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
    name?: string;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

    const { pending_id, page_ids, account_keys, action, workspace_id, social_account_id } = await req.json();
    if (action === 'secure_existing') {
      if (!workspace_id) return json({ error: 'Workspace required' }, 400);
      const service = createClient(SUPABASE_URL, SERVICE_KEY);
      if (!await canManageMetaAccounts(service, user.id, workspace_id)) return json({ error: 'Forbidden' }, 403);
      await assertMetaTokenKey();
      let secured = 0, offset = 0;
      while (true) {
        const { data: accounts, error: readError } = await service.from('social_accounts').select('id,workspace_id,platform,external_id,access_token,refresh_token,updated_at').eq('workspace_id', workspace_id).in('platform', ['facebook', 'instagram']).order('id').range(offset, offset + 99);
        if (readError) throw new Error('Could not read existing Meta connections for encryption');
        for (const account of accounts ?? []) {
          if (!account.access_token || isEncryptedMetaToken(account.access_token)) continue;
          const context = 'account:' + account.workspace_id + ':' + account.platform + ':' + account.external_id;
          const sealed = await encryptMetaToken(account.access_token, context);
          const { data: saved, error: saveError } = await service.from('social_accounts').update({ access_token: sealed, refresh_token: account.refresh_token ? await encryptMetaToken(await decryptMetaToken(account.refresh_token, context + ':refresh'), context + ':refresh') : null, token_encrypted_at: new Date().toISOString() }).eq('id', account.id).eq('updated_at', account.updated_at).select('id').maybeSingle();
          if (saveError) throw new Error('Could not secure an existing Meta connection');
          if (saved) secured++;
        }
        if (!accounts || accounts.length < 100) break;
        offset += accounts.length;
      }
      return json({ secured });
    }
    if (action === 'disconnect') {
      if (!workspace_id || !social_account_id) return json({ error: 'Workspace and account required' }, 400);
      const service = createClient(SUPABASE_URL, SERVICE_KEY);
      if (!await canManageMetaAccounts(service, user.id, workspace_id)) return json({ error: 'Forbidden' }, 403);
      const { data: removed, error: removeError } = await service.from('social_accounts').update({ status: 'disconnected', is_enabled: false, access_token: '', refresh_token: null, last_error: 'Disconnected. Reconnect to resume pending deliveries.' }).eq('id', social_account_id).eq('workspace_id', workspace_id).select('id').maybeSingle();
      if (removeError || !removed) return json({ error: 'Could not disconnect account' }, 400);
      return json({ disconnected: true });
    }
    if (!pending_id || (action !== 'list' && !Array.isArray(page_ids) && !Array.isArray(account_keys))) return json({ error: 'A pending session and account selection are required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: pending, error: pendingErr } = await admin
      .from('meta_oauth_pending')
      .select('*')
      .eq('id', pending_id)
      .maybeSingle();
    if (pendingErr || !pending || pending.user_id !== user.id) return json({ error: 'Pending session not found' }, 404);
    if (workspace_id && workspace_id !== pending.workspace_id) return json({ error: 'Workspace mismatch' }, 403);
    if (!pending.expires_at || Date.parse(pending.expires_at) <= Date.now()) return json({ error: 'Selection expired. Please reconnect.' }, 410);

    if (!await canManageMetaAccounts(admin, user.id, pending.workspace_id)) return json({ error: 'Forbidden' }, 403);

    const pages: PendingPage[] = (pending.pages ?? []) as PendingPage[];
    if (action === 'list') {
      return json({ pages: pages.map(p => ({ id: p.id, name: p.name, instagram_business_account: p.instagram_business_account ?? null, facebook_publishable: (p.granted_scopes ?? []).includes('pages_manage_posts'), instagram_publishable: (p.granted_scopes ?? []).includes('instagram_content_publish') })), expires_at: pending.expires_at });
    }
    const keys = new Set<string>(Array.isArray(account_keys) ? account_keys : pages.filter(p => page_ids.includes(p.id)).flatMap(p => ['facebook:' + p.id, ...(p.instagram_business_account?.id ? ['instagram:' + p.instagram_business_account.id] : [])]));
    const selected = pages.filter(p => keys.has('facebook:' + p.id) || (p.instagram_business_account?.id && keys.has('instagram:' + p.instagram_business_account.id)));
    if (selected.length === 0) return json({ error: 'Select at least one Page' }, 400);


    await assertMetaTokenKey();

    // Consume once only after validation. Upserts preserve account IDs on reconnect.
    const { data: claimed, error: claimError } = await admin.from('meta_oauth_pending').delete().eq('id', pending_id).eq('user_id', user.id).gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (claimError || !claimed) return json({ error: 'Selection already used or expired. Please reconnect.' }, 409);

    let imported = 0;
    for (const page of selected) {
      const expiresAt = page.token_expires_at ?? null;
      const scopes = page.granted_scopes ?? [];
      if (keys.has('facebook:' + page.id)) {
      const pageToken = await decryptMetaToken(page.access_token, `pending:${pending.workspace_id}:${pending.user_id}:page:${page.id}`);
      let avatarUrl: string | null = null;
      try {
        const params = new URLSearchParams({ fields: 'picture.width(200).height(200)', access_token: pageToken });
        const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(page.id)}?${params}`);
        if (response.ok) avatarUrl = (await response.json())?.picture?.data?.url ?? null;
      } catch { /* A picture failure must not prevent the connection. */ }
      const { error: pageError } = await admin.from('social_accounts').upsert({
        workspace_id: pending.workspace_id,
        platform: 'facebook',
        external_id: page.id,
        handle: page.name,
        display_name: page.name,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        access_token: await encryptMetaToken(pageToken, `account:${pending.workspace_id}:facebook:${page.id}`),
        token_encrypted_at: new Date().toISOString(),
        scopes,
        expires_at: expiresAt,
        status: scopes.includes('pages_manage_posts') ? 'connected' : 'error',
        last_error: scopes.includes('pages_manage_posts') ? null : 'Publishing restricted: reconnect and grant Page publishing access',
        connected_by: user.id,
        is_enabled: true,
        metadata: { page_id: page.id },
      }, { onConflict: 'workspace_id,platform,external_id' });
      if (pageError) throw new Error('Could not connect a Facebook Page. Please reconnect to retry.');
      imported++;
      }

      if (page.instagram_business_account?.id && keys.has('instagram:' + page.instagram_business_account.id)) {
        const ig = page.instagram_business_account;
        const { error: igError } = await admin.from('social_accounts').upsert({
          workspace_id: pending.workspace_id,
          platform: 'instagram',
          external_id: ig.id,
          handle: ig.username ?? null,
          display_name: ig.name ?? ig.username ?? null,
          avatar_url: ig.profile_picture_url ?? null,
          access_token: await encryptMetaToken(await decryptMetaToken(page.access_token, `pending:${pending.workspace_id}:${pending.user_id}:page:${page.id}`), `account:${pending.workspace_id}:instagram:${ig.id}`),
          token_encrypted_at: new Date().toISOString(),
          scopes,
          expires_at: expiresAt,
          status: scopes.includes('instagram_content_publish') ? 'connected' : 'error',
          last_error: scopes.includes('instagram_content_publish') ? null : 'Publishing restricted: reconnect and grant Instagram publishing access',
          connected_by: user.id,
          is_enabled: true,
          metadata: { page_id: page.id, ig_user_id: ig.id },
        }, { onConflict: 'workspace_id,platform,external_id' });
        if (igError) throw new Error('Could not connect an Instagram account. Please reconnect to retry.');
        imported++;
      }
    }

    await admin.from('meta_oauth_pending').delete().eq('id', pending_id);

    return json({ imported });
  } catch (e) {
    console.error('meta-import-pages failed');
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
