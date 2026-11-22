import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers});
  try {
    if (req.method !== 'POST') return json({error:'Method not allowed'},405);
    const url = Deno.env.get('SUPABASE_URL')!, admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const client = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization') ?? ''}}});
    const {data:{user}} = await client.auth.getUser(); if (!user) return json({error:'Unauthorized'},401);
    const {action,workspace_id,social_account_id} = await req.json();
    if (action !== 'disconnect' || typeof workspace_id !== 'string' || typeof social_account_id !== 'string') return json({error:'Invalid request'},400);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({error:'Workspace management access required'},403);
    const {data,error} = await admin.from('social_accounts').update({status:'disconnected',is_enabled:false,access_token:'',refresh_token:null,expires_at:null,scopes:[],handle:null,display_name:null,avatar_url:null,metadata:{},last_error:'Disconnected from AutoSocials'}).eq('id',social_account_id).eq('workspace_id',workspace_id).eq('platform','x').select('id').maybeSingle();
    if (error) throw new Error('Could not disconnect this X account.');
    if (!data) return json({error:'X account not found'},404);
    return json({ok:true});
  } catch(e) { console.error('x-account',e instanceof Error ? e.message : 'failed'); return json({error:'X account action failed'},500); }
});
function json(body:unknown,status=200) { return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}}); }
