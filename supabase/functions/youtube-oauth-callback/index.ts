import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { encryptYouTubeToken, youtubeTokenContext } from '../_shared/youtube-tokens.ts';
import { hasRequiredYouTubeScopes } from '../_shared/youtube-oauth.ts';
const ORIGIN = Deno.env.get('SITE_ORIGIN') ?? 'https://autosocials.com';
function redirect(query: Record<string, string>, dest = `${ORIGIN}/oauth/bridge`) { const u = new URL(dest); for (const [k,v] of Object.entries(query)) u.searchParams.set(k,v); return new Response(null,{status:302,headers:{Location:u.toString(),'Cache-Control':'no-store'}}); }
Deno.serve(async req => {
  const url = new URL(req.url), code = url.searchParams.get('code'), state = url.searchParams.get('state');
  const base = Deno.env.get('SUPABASE_URL')!, admin = createClient(base,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let dest = `${ORIGIN}/oauth/bridge`;
  try {
    if (!state) throw new Error('Invalid OAuth state');
    const { data: session } = await admin.from('oauth_states').delete().eq('state',state).eq('platform','youtube').gt('expires_at',new Date().toISOString()).select('*').maybeSingle();
    if (!session) throw new Error('Google connection session expired. Please reconnect.');
    if (!await canManageMetaAccounts(admin, session.user_id, session.workspace_id)) throw new Error('Workspace management access changed. Please reconnect.');
    if (session.redirect_to) { const target = new URL(session.redirect_to); const allowedOrigins=new Set([ORIGIN,'https://autosocials.com','https://www.autosocials.com','http://localhost:4177','http://127.0.0.1:4177']); if (!allowedOrigins.has(target.origin)) throw new Error('Invalid return destination'); if (!['/oauth/bridge','/app/settings/connections'].includes(target.pathname)) throw new Error('Invalid return destination'); dest = target.toString(); }
    if (url.searchParams.has('error') || !code) throw new Error('Google authorization was declined or did not return a code.');
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!, clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:`${base}/functions/v1/youtube-oauth-callback`})});
    const tokens = await tokenRes.json(); if (!tokenRes.ok || !tokens.access_token) throw new Error('Google token exchange failed.');
    if (!hasRequiredYouTubeScopes(String(tokens.scope ?? ''))) throw new Error('Google did not grant both channel viewing and video upload permissions. Reconnect and approve the requested YouTube access.');
    if (!tokens.refresh_token) throw new Error('Google did not provide offline access for scheduled uploads. Reconnect this channel and approve the requested access.');
    const channelRes = await fetch('https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const channelData = await channelRes.json(); if (!channelRes.ok || !channelData.items?.length) throw new Error('No YouTube channel is available for this Google account.');
    if(channelData.items.length!==1) throw new Error('Google returned multiple channels for this grant. Reconnect after choosing the intended YouTube or Brand Account so uploads cannot go to the wrong channel.');
    const pendingId = crypto.randomUUID(), pendingContext = `youtube-pending:${pendingId}`;
    const { error } = await admin.from('youtube_oauth_pending').insert({ id:pendingId,workspace_id:session.workspace_id,user_id:session.user_id,
      access_token:await encryptYouTubeToken(tokens.access_token,pendingContext+':access'),
      refresh_token:tokens.refresh_token ? await encryptYouTubeToken(tokens.refresh_token,pendingContext+':refresh') : null,
      scopes:(tokens.scope ?? '').split(' ').filter(Boolean),channels:channelData.items.map((c:any)=>({id:c.id,title:c.snippet.title,handle:c.snippet.customUrl ?? null,avatar_url:c.snippet.thumbnails?.default?.url ?? null})) });
    if(error) throw new Error('Could not save the secure channel selection session.');
    return redirect({status:'youtube_select',youtube_select:pendingId},dest);
  } catch(e) { console.error('youtube-oauth-callback',e instanceof Error?e.message:'failed'); return redirect({status:'error',error:e instanceof Error?e.message:'Google connection failed'},dest); }
});
