import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { companyExternalId, companyIdFromExternal, getLinkedInCompanyAvatar } from '../_shared/linkedin-company.ts';
import { decryptLinkedInToken, encryptLinkedInToken, linkedInTokenContext } from '../_shared/linkedin-tokens.ts';
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers});
  try {
    if (req.method !== 'POST') return json({error:'Method not allowed'},405);
    const url = Deno.env.get('SUPABASE_URL')!, admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const client = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization') ?? ''}}});
    const {data:{user}} = await client.auth.getUser(); if (!user) return json({error:'Unauthorized'},401);
    const {action,workspace_id,social_account_id,pending_id,page_id} = await req.json();
    if (!['disconnect','list_pages','select_page','refresh_company_avatar'].includes(action) || typeof workspace_id !== 'string') return json({error:'Invalid request'},400);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({error:'Workspace management access required'},403);
    if (action === 'refresh_company_avatar') {
      if (typeof social_account_id !== 'string') return json({error:'Invalid request'},400);
      const {data:account,error} = await admin.from('social_accounts')
        .select('external_id, access_token, token_encrypted_at')
        .eq('id',social_account_id).eq('workspace_id',workspace_id).eq('platform','linkedin')
        .eq('status','connected').gt('expires_at',new Date().toISOString()).maybeSingle();
      if (error) throw new Error('Could not read the LinkedIn account.');
      const companyId = account && companyIdFromExternal(account.external_id);
      if (!account || !companyId || !account.token_encrypted_at) return json({error:'LinkedIn Company Page not found'},404);

      const token = await decryptLinkedInToken(account.access_token, linkedInTokenContext(workspace_id, account.external_id, 'access'));
      const avatarUrl = await getLinkedInCompanyAvatar(companyId, token);
      if (!avatarUrl) return json({avatar_url:null});

      const {data:updated,error:saveError} = await admin.from('social_accounts')
        .update({avatar_url:avatarUrl})
        .eq('id',social_account_id).eq('workspace_id',workspace_id).eq('platform','linkedin')
        .eq('status','connected').eq('token_encrypted_at',account.token_encrypted_at).select('avatar_url').maybeSingle();
      if (saveError) throw new Error('Could not save the LinkedIn Page logo.');
      return json({avatar_url:updated?.avatar_url ?? null});
    }
    if (action !== 'disconnect') {
      if (typeof pending_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(pending_id)) return json({error:'Invalid Page connection session'},400);
      const now = new Date().toISOString();
      const {data:pending,error} = await admin.from('linkedin_pending_pages')
        .select('pages, encrypted_token')
        .eq('id',pending_id).eq('workspace_id',workspace_id).eq('user_id',user.id)
        .gt('expires_at',now).gt('token_expires_at',now).maybeSingle();
      if (error) throw new Error('Could not read LinkedIn Page selection.');
      if (!pending) return json({error:'This Page selection expired. Please reconnect.'},404);
      if (action === 'list_pages') return json({pages:pending.pages});
      if (typeof page_id !== 'string' || !/^\d+$/.test(page_id) || !pending.pages.some((page: {id:string}) => page.id === page_id))
        return json({error:'Choose a Company Page authorized by LinkedIn.'},400);
      const token = await decryptLinkedInToken(pending.encrypted_token, linkedInTokenContext(workspace_id, 'pending:' + pending_id, 'access'));
      const encrypted = await encryptLinkedInToken(token, linkedInTokenContext(workspace_id, companyExternalId(page_id), 'access'));
      const {data:page,error:saveError} = await admin.rpc('connect_linkedin_company_page',{
        p_pending_id:pending_id,p_workspace_id:workspace_id,p_user_id:user.id,p_page_id:page_id,p_token:encrypted,
      });
      if (saveError) throw new Error('Could not save the LinkedIn Page.');
      if (!page) return json({error:'This Page selection expired. Please reconnect.'},409);
      return json({page});
    }
    if (typeof social_account_id !== 'string') return json({error:'Invalid request'},400);
    const {data,error} = await admin.from('social_accounts').update({status:'disconnected',is_enabled:false,access_token:'',refresh_token:null,expires_at:null,scopes:[],handle:null,display_name:null,avatar_url:null,metadata:{},last_error:'Disconnected from AutoSocials'}).eq('id',social_account_id).eq('workspace_id',workspace_id).eq('platform','linkedin').select('id').maybeSingle();
    if (error) throw new Error('Could not disconnect this LinkedIn account.');
    if (!data) return json({error:'LinkedIn account not found'},404);
    return json({ok:true});
  } catch(e) { console.error('linkedin-account',e instanceof Error ? e.message : 'failed'); return json({error:'LinkedIn account action failed'},500); }
});
function json(body:unknown,status=200) { return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}}); }
