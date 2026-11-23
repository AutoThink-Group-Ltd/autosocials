import { firecrawlWebResults } from "../_shared/firecrawl.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonicalProfile(raw: unknown, username: unknown): string | null {
 if (typeof raw !== "string" || typeof username !== "string") return null;
 try {
  const u = new URL(raw); const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.protocol !== "https:" || u.username || u.password || u.port || !["tiktok.com","instagram.com","youtube.com"].includes(host)) return null;
  const handle = username.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._-]{2,80}$/.test(handle)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || parts[0].replace(/^@/, "").toLowerCase() !== handle) return null;
  if (host === "youtube.com" && !parts[0].startsWith("@")) return null;
  return `https://${host}/${parts[0].toLowerCase()}`;
 } catch { return null; }
}
function emails(text: string): string[] {
 const matches = text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || [];
 return [...new Set(matches.map(x=>x.toLowerCase()).filter(x=>x.length<=254 && !/\.(png|jpg|jpeg|gif|webp|svg|js|css)$/.test(x) && !/^(example|test|noreply|no-reply|support|privacy|abuse)@/.test(x) && !/@(example\.(com|org|net)|sentry\.io|wixpress\.com)$/.test(x)))];
}
Deno.serve(async req => {
 if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
 if (req.method !== "POST") return json({error:"Method not allowed"},405);
 const authorization=req.headers.get("authorization") || "";
 if (!authorization.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), firecrawl=Deno.env.get("FIRECRAWL_API_KEY");
 if (!url || !key || !firecrawl) return json({error:"Contact lookup is unavailable"},503);
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await admin.auth.getUser(authorization.slice(7));
 if(authError || !auth.user) return json({error:"Unauthorized"},401);
 let input: any; try { input=await req.json(); } catch {return json({error:"Invalid request"},400);}
 if (!uuid.test(input?.workspaceId || "") || !uuid.test(input?.creatorId || "")) return json({error:"Invalid request"},400);
 const {data:allowed,error:accessError}=await admin.rpc("can_access_workspace",{_user_id:auth.user.id,_workspace_id:input.workspaceId});
 if(accessError || !allowed) return json({error:"Workspace access denied"},403);
 const {data:creator,error:creatorError}=await admin.from("outreach_creators").select("id,workspace_id,username,profile_url,email,version").eq("id",input.creatorId).eq("workspace_id",input.workspaceId).maybeSingle();
 if(creatorError) return json({error:"Contact lookup is unavailable"},503);
 if(!creator) return json({error:"Creator not found"},404);
 if(creator.email) return json({status:"already_present"});
 const profile=canonicalProfile(creator.profile_url,creator.username);
 if(!profile) return json({status:"not_found"});
 const {data:reserved,error:limitError}=await admin.rpc("reserve_outreach_lookup",{_workspace_id:input.workspaceId,_user_id:auth.user.id});
 if(limitError) return json({error:"Contact lookup is unavailable"},503);
 if(!reserved) return json({error:"Contact lookup limit reached. Please try again later."},429);
 try {
  const response=await fetch("https://api.firecrawl.dev/v2/search",{method:"POST",headers:{Authorization:`Bearer ${firecrawl}`,"Content-Type":"application/json"},body:JSON.stringify({query:`"${profile}" contact email`,limit:3,scrapeOptions:{formats:["markdown"],onlyMainContent:true}}),signal:AbortSignal.timeout(20000)});
  if(!response.ok) return json({error:"Contact lookup is unavailable"},502);
  const result=await response.json(); const rows=firecrawlWebResults(result);
  for (const row of rows.slice(0,3)) {
   const source=canonicalProfile(row.url || row.metadata?.sourceURL,creator.username);
   if(source!==profile || typeof row.markdown!=="string") continue;
   const found=emails(row.markdown.slice(0,40000));
   // Ambiguous addresses require human review, not automatic selection.
   if(found.length!==1) continue;
   const checkedAt=new Date().toISOString();
   const {data:updated,error:updateError}=await admin.from("outreach_creators").update({email:found[0],contact_source:`Public profile: ${profile} (checked ${checkedAt.slice(0,10)})`,version:creator.version+1,updated_at:checkedAt}).eq("workspace_id",input.workspaceId).eq("id",creator.id).eq("version",creator.version).is("email",null).select("id").maybeSingle();
   if(updateError) return json({error:"Contact could not be saved"},409);
   if(!updated) return json({status:"changed"});
   return json({status:"found",email:found[0],sourceUrl:profile,checkedAt});
  }
  return json({status:"not_found"});
 } catch { return json({error:"Contact lookup is unavailable"},502); }
});

