import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAdminClient, requireUser, supabaseUrl } from "./supabase-admin.server";

const base = z.object({ workspace_id: z.string().uuid() });
async function access(workspaceId: string, owner = false) {
  const user = await requireUser();
  const db = getAdminClient();
  const { data, error } = await db.rpc(owner ? "is_workspace_owner" : "can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (error || !data) throw new Error("Workspace access required.");
  return db;
}
async function settings(workspaceId: string) {
  const db = await access(workspaceId);
  const [identities, domains, sender, proofs] = await Promise.all([
    db.from("sender_identities").select("id,sender_name,sender_email,is_verified").eq("workspace_id", workspaceId),
    db.from("workspace_domains").select("id,domain,status,dns_records,sendgrid_domain_id").eq("workspace_id", workspaceId),
    (db as any).from("outreach_sender_settings").select("from_name,signature_text").eq("workspace_id", workspaceId).maybeSingle(),
    (db as any).from("outreach_domain_proofs").select("domain,challenge,verified_at").eq("workspace_id", workspaceId),
  ]);
  if (identities.error || domains.error || sender.error || proofs.error) throw new Error("Sender settings are unavailable.");
  return { platform: { email: "info@autosocials.com", name: sender.data?.from_name || "AutoSocials", ready: process.env["OUTREACH_DELIVERY_ENABLED"] === "true" }, identities: (identities.data ?? []).map(i => ({ ...i, is_verified: i.is_verified && !!proofs.data?.some((p: any) => p.domain === i.sender_email.toLowerCase().split("@")[1] && p.verified_at) && !!domains.data?.some(d => d.domain === i.sender_email.toLowerCase().split("@")[1] && d.status === "verified" && d.sendgrid_domain_id) })), domains: (proofs.data ?? []).map((p: any) => { const d = (domains.data ?? []).find(row => row.domain === p.domain); return { id: p.domain, domain: p.domain, status: !p.verified_at ? "Verify domain ownership" : d?.status || "Domain ownership verified", dns_records: !p.verified_at ? [{ type: "TXT", host: `_autosocials.${p.domain}`, data: p.challenge, valid: false }] : Array.isArray(d?.dns_records) ? d.dns_records as {type:string;host:string;data:string;valid:boolean}[] : [] }; }), signature_text: sender.data?.signature_text || "" };
}
export const getOutreachSenderSettings = createServerFn({ method: "POST" }).inputValidator((v: unknown) => base.parse(v)).handler(({ data }) => settings(data.workspace_id));
export const saveOutreachSender = createServerFn({ method: "POST" }).inputValidator((v: unknown) => base.extend({ sender_name: z.string().trim().min(1).max(100), sender_email: z.string().email().optional(), signature_text: z.string().max(4000) }).parse(v)).handler(async ({ data }) => {
  const db = await access(data.workspace_id, true);
  const result = await (db as any).from("outreach_sender_settings").upsert({ workspace_id: data.workspace_id, from_name: data.sender_name, signature_text: data.signature_text }, { onConflict: "workspace_id" });
  if (result.error) throw new Error("Could not save sender settings.");
  if (data.sender_email) {
    const email = data.sender_email.toLowerCase();
    const existing = await db.from("sender_identities").select("id").eq("workspace_id", data.workspace_id).eq("sender_email", email).maybeSingle();
    if (existing.error) throw new Error("Could not check the sender identity.");
    if (!existing.data) {
      const domain = email.split("@")[1]!;
      const [proof, verifiedDomain] = await Promise.all([
        (db as any).from("outreach_domain_proofs").select("verified_at").eq("workspace_id", data.workspace_id).eq("domain", domain).maybeSingle(),
        db.from("workspace_domains").select("status,sendgrid_domain_id").eq("workspace_id", data.workspace_id).eq("domain", domain).maybeSingle(),
      ]);
      if (proof.error || verifiedDomain.error) throw new Error("Could not check domain verification.");
      const isVerified = !!proof.data?.verified_at && verifiedDomain.data?.status === "verified" && !!verifiedDomain.data.sendgrid_domain_id;
      const inserted = await db.from("sender_identities").insert({ workspace_id: data.workspace_id, sender_name: data.sender_name, sender_email: email, is_verified: isVerified });
      if (inserted.error) throw new Error("Could not add sender identity.");
    }
  }
  return settings(data.workspace_id);
});
export const setupOutreachDomain = createServerFn({ method: "POST" }).inputValidator((v: unknown) => base.extend({ domain: z.string().trim().toLowerCase().min(3).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/), action: z.enum(["authenticate", "verify"]) }).parse(v)).handler(async ({ data }) => {
  const db = await access(data.workspace_id, true);
  const lookup = await (db as any).from("outreach_domain_proofs").select("challenge,verified_at").eq("workspace_id", data.workspace_id).eq("domain", data.domain).maybeSingle();
  if (lookup.error) throw new Error("Could not check domain ownership.");
  if (data.action === "authenticate" && !lookup.data) {
    const challenge = `autosocials-verification=${crypto.randomUUID()}${crypto.randomUUID()}`;
    const saved = await (db as any).from("outreach_domain_proofs").insert({ workspace_id: data.workspace_id, domain: data.domain, challenge });
    if (saved.error) throw new Error("Could not create domain ownership challenge.");
    return settings(data.workspace_id);
  }
  if (!lookup.data) throw new Error("Start domain setup first.");
  if (!lookup.data.verified_at) {
    const dns = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`_autosocials.${data.domain}`)}&type=TXT`, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(10000) });
    if (!dns.ok) throw new Error("Could not check the DNS record. Try again.");
    const answer = await dns.json();
    const found = Array.isArray(answer.Answer) && answer.Answer.some((r: any) => r.type === 16 && typeof r.data === "string" && r.data.replaceAll('"', '').replaceAll(' ', '') === lookup.data.challenge);
    if (!found) throw new Error("Ownership TXT record not found yet. Check the host and value, then try again.");
    const saved = await (db as any).from("outreach_domain_proofs").update({ verified_at: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("domain", data.domain);
    if (saved.error) throw new Error("Could not save domain ownership proof.");
  }
  const existing = await db.from("workspace_domains").select("id").eq("workspace_id", data.workspace_id).eq("domain", data.domain).maybeSingle();
  if (existing.error) throw new Error("Could not check the sending domain.");
  const auth = getRequestHeader("authorization");
  const config = await db.from("workspace_sendgrid_config").select("id").eq("workspace_id", data.workspace_id).maybeSingle();
  if (config.error) throw new Error("Could not check the email provider setup.");
  if (!config.data) {
    const provision = await fetch(`${supabaseUrl()}/functions/v1/provision-sendgrid-subuser`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth || "" }, body: JSON.stringify({ workspace_id: data.workspace_id }) });
    const provisionResult = await provision.json();
    if (!provision.ok || provisionResult.error) throw new Error(provisionResult.error || "Could not prepare your sending account.");
  }
  const response = await fetch(`${supabaseUrl()}/functions/v1/manage-domain-auth`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth || "" }, body: JSON.stringify({ ...data, action: existing.data ? "verify" : "authenticate" }) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || "Domain setup unavailable.");
  if (result.valid === true) {
    const verified = await db.from("sender_identities").update({ is_verified: true }).eq("workspace_id", data.workspace_id).ilike("sender_email", `%@${data.domain}`);
    if (verified.error) throw new Error("Domain verified, but sender verification could not be saved.");
  }
  return settings(data.workspace_id);
});
