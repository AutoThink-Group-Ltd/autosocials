import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve the exact identity reviewed by the user. Never silently substitute senders. */
export async function resolveOutreachSender(db: SupabaseClient<any>, workspaceId: string, identityId?: string | null) {
  const settings = await db.from("outreach_sender_settings").select("from_name,signature_text").eq("workspace_id", workspaceId).maybeSingle();
  if (settings.error) throw new Error("Sender settings are unavailable.");
  const signature = settings.data?.signature_text || "";
  if (!identityId) return { sender_identity_id: null, from_name: settings.data?.from_name || "AutoSocials", from_email: "info@autosocials.com", signature };
  const identity = await db.from("sender_identities").select("id,sender_name,sender_email,is_verified").eq("workspace_id", workspaceId).eq("id", identityId).maybeSingle();
  if (identity.error || !identity.data?.is_verified) throw new Error("The selected sender is not verified in this workspace.");
  const email = identity.data.sender_email.toLowerCase();
  const domain = email.split("@")[1];
  const proof = await db.from("outreach_domain_proofs").select("verified_at").eq("workspace_id", workspaceId).eq("domain", domain).maybeSingle();
  if (proof.error || !proof.data?.verified_at) throw new Error("Verify ownership of this domain in Outreach sender settings.");
  const verified = await db.from("workspace_domains").select("status,sendgrid_domain_id").eq("workspace_id", workspaceId).eq("domain", domain).maybeSingle();
  if (verified.error || verified.data?.status !== "verified" || !verified.data.sendgrid_domain_id) throw new Error("The sender domain is not verified.");
  return { sender_identity_id: identity.data.id as string | null, from_name: settings.data?.from_name || identity.data.sender_name, from_email: email, signature };
}
