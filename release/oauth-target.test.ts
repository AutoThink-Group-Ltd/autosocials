import {describe,it,expect,vi} from 'vitest';
const setting=vi.hoisted(()=>({url:'https://example.invalid'}));
vi.mock('@/lib/supabase-admin.server',()=>({supabaseUrl:()=>setting.url}));
import {handleXOAuthCallback} from '../src/routes/api/oauth/x/callback';
describe('X OAuth callback forwarding',()=>{
 it('targets the configured project and passes only allowed OAuth parameters',async()=>{setting.url='https://example.invalid';const result=await handleXOAuthCallback(new Request('https://app.invalid/api/oauth/x/callback?code=test&state=test&untrusted=ignored'));const url=new URL(result.headers.get('location')!);expect(url.origin).toBe('https://example.invalid');expect(url.pathname).toBe('/functions/v1/x-oauth-callback');expect(url.searchParams.get('state')).toBe('test');expect(url.searchParams.has('untrusted')).toBe(false);expect(result.headers.get('referrer-policy')).toBe('no-referrer')});
 it('fails closed for an invalid configured destination',async()=>{setting.url='https://user:password@example.invalid';const result=await handleXOAuthCallback(new Request('https://app.invalid/api/oauth/x/callback'));expect(result.status).toBe(503);expect(result.headers.has('location')).toBe(false)});
});
import { readFileSync } from 'node:fs';
const edgeSources=['supabase/functions/linkedin-oauth-init/index.ts','supabase/functions/linkedin-oauth-callback/index.ts'].map(p=>readFileSync(p,'utf8'));
describe('LinkedIn OAuth edge configuration',()=>{
 for(const source of edgeSources) {
  it('uses the configured app origin and fails closed on unsafe origins',()=>{
   const declaration=source.match(/const publicOrigins = \(\) => \{[\s\S]*?\n\};/)?.[0]; expect(declaration).toBeTruthy();
   const origins=(value:string|undefined)=>new Function('Deno',`${declaration}; return publicOrigins();`)({env:{get:()=>value}});
   expect(origins('https://selfhost.example')).toEqual(['https://selfhost.example']);expect(origins(undefined)).toEqual(['https://autosocials.com','https://www.autosocials.com']);expect(()=>origins('https://user:password@selfhost.example')).toThrow();expect(()=>origins('https://selfhost.example/path')).toThrow();
  });
 }
 it('uses the same configured callback in initiation and token exchange',()=>{
  const init=edgeSources[0]!.match(/const callback = (.*);/)?.[1], callback=edgeSources[1]!.match(/const callback = (.*);/)?.[1];expect(init).toBeTruthy();expect(callback).toBeTruthy();
  const a=new Function('url',`return ${init}`)('https://example.invalid/'); const b=new Function('supabaseUrl',`return ${callback}`)('https://example.invalid/');expect(a).toBe('https://example.invalid/functions/v1/linkedin-oauth-callback');expect(b).toBe(a);
 });
});
