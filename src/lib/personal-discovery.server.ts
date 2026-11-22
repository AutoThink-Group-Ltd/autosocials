import { personalLeaseIsActive, commitPersonalLease } from "./personal-brand-lease";
import { getAdminClient } from "./supabase-admin.server";
import { selectedProfiles, socialExcerpt } from "./brand-discovery.server";
import { reusablePersonalSections } from "./personal-retry";
import { personalLinkedIn } from "./profile-dna";

/** Invalidate any older claim after a profile write; token CAS fences in-flight workers. */
export async function invalidatePersonalDiscovery(workspaceId: string): Promise<void> {
  const db = getAdminClient() as any;
  const key = { workspace_id: workspaceId, kind: "personal-discovery", signature: "v1" };
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await db.from("brand_work_operations").select("token,status,updated_at").match(key).maybeSingle();
    if (current.error) throw new Error("Could not invalidate previous social review");
    if (!current.data) return;
    const changed = await db.from("brand_work_operations").update({ token: crypto.randomUUID(), status: "failed", updated_at: new Date().toISOString() }).match(key).eq("token", current.data.token).eq("status", current.data.status).eq("updated_at", current.data.updated_at).select("token").maybeSingle();
    if (changed.error) throw new Error("Could not invalidate previous social review");
    if (changed.data) return;
  }
  throw new Error("Social profiles saved, but the review could not be restarted. Refresh it from Home.");
}

/** Personal discovery stores its complete snapshot in the fenced claim itself. */
export async function runPersonalDiscovery(workspaceId: string, _userId?: string, _refreshSocial?: boolean, attempt = 0, retryUrl?: string): Promise<void> {
  const admin = getAdminClient();
  const db = admin as any;
  const key = { workspace_id: workspaceId, kind: "personal-discovery", signature: "v1" };
  const token = crypto.randomUUID();
  const claim = await db.from("brand_work_operations").insert({ ...key, token, status: "running" }).select("token").maybeSingle();
  if (claim.error && claim.error.code !== "23505") throw new Error("Could not reserve personal discovery");
  if (!claim.data) {
    const old = await db.from("brand_work_operations").select("token,status,updated_at").match(key).single();
    if (old.error) throw new Error("Could not check personal discovery");
    if (personalLeaseIsActive(old.data.status, old.data.updated_at)) return;
    const taken = await db.from("brand_work_operations").update({ token, status: "running", updated_at: new Date().toISOString() }).match(key).eq("token", old.data.token).eq("status", old.data.status).eq("updated_at", old.data.updated_at).select("token").maybeSingle();
    if (taken.error) throw new Error("Could not reserve personal discovery");
    if (!taken.data) return;
  }
  try {
    const prior = await db.from("brand_work_operations").select("result").match(key).eq("token", token).maybeSingle();
    if (prior.error) throw new Error("Could not load previous social evidence");
    const priorContent = typeof prior.data?.result?.content === "string" ? prior.data.result.content : undefined;
    const workspace = await admin.from("workspaces").select("social_profiles").eq("id", workspaceId).single();
    if (workspace.error) throw new Error("Could not load social profiles");
    const source = JSON.stringify(workspace.data.social_profiles);
    const profiles = selectedProfiles(workspace.data.social_profiles, 20);
    const urls = profiles.map((item) => item.url || (["instagram", "facebook", "tiktok"].includes(item.platform) ? `https://www.${item.platform}.com/${item.platform === "tiktok" ? "@" : ""}${item.handle}` : `${item.platform}:@${item.handle}`));
    const reusable = retryUrl && priorContent ? reusablePersonalSections(priorContent, urls) : null;
    if (retryUrl && (!urls.includes(retryUrl) || !reusable)) throw new Error("Saved profiles changed. Update the full review instead.");
    const excerpts = await Promise.all(urls.map(async (url) => {
      if (retryUrl && url !== retryUrl) return reusable!.get(url)!;
      try { return await socialExcerpt(url, true, priorContent, workspaceId); } catch { return `Profile: ${url}\nPublic posts could not be retrieved.`; }
    }));
    const current = await admin.from("workspaces").select("social_profiles").eq("id", workspaceId).single();
    if (current.error) throw new Error("Could not verify social profiles");
    if (JSON.stringify(current.data.social_profiles) !== source) {
      const released = await db.from("brand_work_operations").update({ status: "failed", updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running").select("token").maybeSingle();
      if (released.error) throw new Error("Could not reschedule personal discovery");
      if (released.data && attempt < 2) return runPersonalDiscovery(workspaceId, _userId, true, attempt + 1, retryUrl);
      throw new Error("Social profiles changed repeatedly; refresh again.");
    }
    const header = `Selected profiles: ${urls.join(" | ")}\nChecked: ${new Date().toISOString()}\n`;
    const budget = Math.max(0, Math.floor((120000 - header.length - excerpts.length * 2) / Math.max(1, excerpts.length)));
    const bounded = excerpts.map((excerpt) => {
      const parts = excerpt.split(/(?=^- (?:\S+|Date unavailable) https:\/\/)/m);
      let result = (parts.shift() ?? "").slice(0, budget);
      for (const post of parts) { if (result.length + post.length > budget) break; result += post; }
      return result;
    });
    const content = header + bounded.join("\n\n");
    if (!(await commitPersonalLease(db, key, token, { content }))) return;
    const linkedin = personalLinkedIn(workspace.data.social_profiles);
    const linkedinExcerpt = linkedin ? excerpts[urls.indexOf(linkedin)] : undefined;
    if (linkedin && linkedinExcerpt) {
      try {
        const { buildLeadProfileDna } = await import("./profile-dna.server");
        await buildLeadProfileDna(admin, workspaceId, linkedin, linkedinExcerpt, !!_refreshSocial, true);
      } catch (error) { console.warn("Could not build Profile DNA from personal discovery", error instanceof Error ? error.message : "Unknown error"); }
    }
    const { runPersonalBrandReport } = await import("./personal-brand.functions");
    for (let retry = 0; retry < 20; retry++) {
      const result = await runPersonalBrandReport(workspaceId);
      if (!result.busy) return;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("A previous review is still running. Refresh again shortly.");
  } catch (error) {
    await db.from("brand_work_operations").update({ status: "failed", updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running");
    throw error;
  }
}
