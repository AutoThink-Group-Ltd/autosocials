import { getAdminClient } from "./supabase-admin.server";
import { BRAND_CONTEXT_NEEDED, type BrandContext } from "./brand-context";
import { personalLinkedIn } from "./profile-dna";

export { BRAND_CONTEXT_NEEDED, type BrandContext } from "./brand-context";

type Admin = ReturnType<typeof getAdminClient>;

export async function readBrandContext(admin: Admin, workspaceId: string): Promise<BrandContext> {
  const [files, docs, ws, identity] = await Promise.all([
    admin.from("brand_files").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    admin.from("dossier_documents").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    admin.from("workspaces").select("website,social_profiles").eq("id", workspaceId).maybeSingle(),
    (admin as unknown as import("@supabase/supabase-js").SupabaseClient).from("brand_dna_state").select("active_version").eq("workspace_id",workspaceId).maybeSingle(),
  ]);
  const count = (r: { count?: number | null }) => r.count ?? 0;
  const hasBrandEvidence = !!identity.data?.active_version || count(files) > 0 || count(docs) > 0;
  const profileUrl = hasBrandEvidence ? null : personalLinkedIn(ws.data?.social_profiles);
  const profile = profileUrl ? await (await import("./profile-dna.server")).readLeadProfileDna(admin, workspaceId, profileUrl) : null;
  return {
    files: count(files),
    docs: count(docs),
    website: ws.data?.website?.trim() || null,
    ready: hasBrandEvidence || !!profile?.dna,
  };
}

/** Throws the user-facing routing message when the workspace has nothing to plan from. */
export async function requireBrandContext(admin: Admin, workspaceId: string): Promise<BrandContext> {
  const ctx = await readBrandContext(admin, workspaceId);
  if (!ctx.ready) throw new Error(BRAND_CONTEXT_NEEDED);
  return ctx;
}
