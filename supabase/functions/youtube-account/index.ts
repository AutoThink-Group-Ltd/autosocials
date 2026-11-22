import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { decryptYouTubeToken, encryptYouTubeToken, youtubeTokenContext } from '../_shared/youtube-tokens.ts';
const headers = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' };
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  try {
    const url=Deno.env.get('SUPABASE_URL')!,admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth=req.headers.get('Authorization')??''; const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser(); if(!user) return json({error:'Unauthorized'},401);
    const {action,workspace_id,pending_id,channel_id,social_account_id}=await req.json();
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({error:'Workspace management access required'},403);
    if(action==='list_pending'){
      const {data,error}=await admin.from('youtube_oauth_pending').select('id,channels,expires_at').eq('id',pending_id).eq('workspace_id',workspace_id).eq('user_id',user.id).gt('expires_at',new Date().toISOString()).maybeSingle();
      if(error||!data) return json({error:'Channel selection expired. Reconnect YouTube.'},404);
      return json({channels:data.channels});
    }
    if(action==='select_pending'){
      const {data:pending,error}=await admin.from('youtube_oauth_pending').delete().eq('id',pending_id).eq('workspace_id',workspace_id).eq('user_id',user.id).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();
      if(error||!pending) return json({error:'Channel selection expired. Reconnect YouTube.'},404);
      const channel=(pending.channels as any[]).find(c=>c.id===channel_id); if(!channel) return json({error:'That channel was not returned by Google.'},400);
      const tokenContext=`youtube-pending:${pending.id}`;
      const row={workspace_id,platform:'youtube',external_id:channel.id,handle:channel.handle,display_name:channel.title,avatar_url:channel.avatar_url,
        access_token:await encryptYouTubeToken(await decryptYouTubeToken(pending.access_token,tokenContext+':access'),youtubeTokenContext(workspace_id,channel.id,'access')),
        refresh_token:pending.refresh_token?await encryptYouTubeToken(await decryptYouTubeToken(pending.refresh_token,tokenContext+':refresh'),youtubeTokenContext(workspace_id,channel.id,'refresh')):null,
        scopes:pending.scopes,expires_at:new Date(Date.now()+3600_000).toISOString(),status:'connected',is_enabled:true,last_error:null,connected_by:user.id,metadata:{channel_id:channel.id,channel_title:channel.title,provider:'google-youtube'}};
      const {error:saveError}=await admin.from('social_accounts').upsert(row,{onConflict:'workspace_id,platform,external_id'});
      if(saveError) return json({error:'Could not save the selected YouTube channel.'},500);
      return json({ok:true,channel:channel.title});
    }
    if(action==='disconnect'){
      const {data:account}=await admin.from('social_accounts').select('id,workspace_id').eq('id',social_account_id).eq('workspace_id',workspace_id).eq('platform','youtube').maybeSingle();
      if(!account) return json({error:'YouTube channel not found.'},404);
      const {error}=await admin.from('social_accounts').update({status:'disconnected',is_enabled:false,access_token:'',refresh_token:null,expires_at:null,scopes:[],handle:null,display_name:null,avatar_url:null,metadata:{},last_error:'Disconnected from AutoSocials'}).eq('id',account.id).eq('workspace_id',workspace_id);
      if(error) return json({error:'Could not disconnect this YouTube channel.'},500);
      return json({ok:true});
    }
    return json({error:'Unsupported action'},400);
  }catch(e){console.error('youtube-account',e instanceof Error?e.message:'failed');return json({error:e instanceof Error?e.message:'YouTube account action failed'},500);}
});
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}});}
