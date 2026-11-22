import { CONNECTED_EVIDENCE_DAYS } from "./personal-connected-feeds";
import { waitUntil } from "@vercel/functions";
import prompt from "../../prompts/personal-brand-review.txt?raw";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { personalLeaseIsActive, personalSourceIsCurrent, PERSONAL_LEASE_MS, commitPersonalLease } from "./personal-brand-lease";
import { validatePersonalBrandReport, limitPersonalFindingCitations, connectedPostAttribution, personalPostAttribution, personalProfileEvidence, type PersonalBrandReport } from "./personal-brand-report";
import { goalsBriefSchema, guidedGoalsSchema, parsePersonalGoals, PERSONAL_GOALS_TITLE } from "./personal-brand-goals";
import { personalLinkedIn } from "./profile-dna";

const input = z.object({ workspace_id: z.string().uuid() });
export async function workspaceBrandContext(workspaceId: string, requirePersonal: boolean | "any" = false) {
  const user = await requireUser();
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("Forbidden");
  const kind = await admin.from("agency_clients").select("workspace_kind").eq("workspace_id", workspaceId).eq("status", "active").eq("workspace_kind", "personal").limit(1);
  if (kind.error) throw new Error("Could not check workspace type");
  const personal = !!kind.data?.length;
  if (requirePersonal === true && !personal) throw new Error("Personal workspace required");
  if (requirePersonal === false && personal) throw new Error("Business workspace required");
  const [owner, agency, member, staffOwner, staffRole] = await Promise.all([
    admin.rpc("is_workspace_owner", { _user_id: user.id, _workspace_id: workspaceId }),
    admin.from("agency_client_links").select("id").eq("agency_user_id", user.id).eq("workspace_id", workspaceId).eq("status", "active").limit(1),
    admin.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle(),
    admin.rpc("agency_staff_owner", { _user_id: user.id }),
    admin.rpc("agency_staff_role", { _user_id: user.id }),
  ]);
  let staffCanEdit = false;
  if (staffOwner.data && ["owner", "admin"].includes(String(staffRole.data))) {
    const linked = await admin.from("agency_clients").select("id").eq("agency_user_id", staffOwner.data).eq("workspace_id", workspaceId).eq("status", "active").limit(1);
    staffCanEdit = !!linked.data?.length;
  }
  return { user, admin, personal, canEdit: !!owner.data || (!agency.error && !!agency.data?.length) || member.data?.role === "admin" || staffCanEdit };
}

export async function personalBrandContext(workspaceId: string) { return workspaceBrandContext(workspaceId, true); }

export const getPersonalBrandReport = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { admin } = await personalBrandContext(data.workspace_id);
    const operation = await (admin as any).from("brand_work_operations").select("result").eq("workspace_id", data.workspace_id).eq("kind", "personal-brand-report").eq("signature", "v1").maybeSingle();
    if (operation.error) throw new Error("Could not load your personal brand review");
    if (operation.data?.result) { try { return validatePersonalBrandReport(operation.data.result); } catch { /* Fall back to older saved review. */ } }
    const result = await admin.from("dossier_documents").select("content,updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", "Personal brand review").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Could not load your personal brand review");
    if (!result.data?.content) return null;
    try { return validatePersonalBrandReport(JSON.parse(result.data.content)); } catch { return null; }
  });

const KIND = "personal-brand-report";
const KIND_DISCOVERY = "personal-discovery";
const SIGNATURE = "v1";
const STALE_MS = PERSONAL_LEASE_MS;

/** A single persistent, fenced claim per workspace; a previous successful result remains readable while refreshing. */
export const runPersonalBrandReport = createServerOnlyFn(async (workspaceId: string) => {
  const admin = getAdminClient();
  const operations = admin as any;
  const key = { workspace_id: workspaceId, kind: KIND, signature: SIGNATURE };
  const token = crypto.randomUUID();
  const inserted = await operations.from("brand_work_operations").insert({ ...key, token, status: "running" }).select("token").maybeSingle();
  if (inserted.error && inserted.error.code !== "23505") throw new Error("Could not reserve your review");
  if (!inserted.data) {
    const current = await operations.from("brand_work_operations").select("token,status,updated_at,result").match(key).single();
    if (current.error) throw new Error("Could not check review progress");
    if (personalLeaseIsActive(current.data.status, current.data.updated_at)) return { busy: true };
    const claim = await operations.from("brand_work_operations").update({ token, status: "running", updated_at: new Date().toISOString() }).match(key).eq("token", current.data.token).eq("updated_at", current.data.updated_at).eq("status", current.data.status).select("token").maybeSingle();
    if (claim.error) throw new Error("Could not reserve your review");
    if (!claim.data) return { busy: true };
  }
  try {
    const data = { workspace_id: workspaceId };
    const source = await operations.from("brand_work_operations").select("result,updated_at").eq("workspace_id", data.workspace_id).eq("kind", "personal-discovery").eq("signature", "v1").maybeSingle();
    if (source.error) throw new Error("Could not load social evidence");
    const content = typeof source.data?.result?.content === "string" ? source.data.result.content : "";
    const evidence: PersonalBrandReport["evidence"] = [];
    for (const section of content.split(/\n\n(?=Profile: )/)) {
      const profile = section.match(/(?:^|\n)Profile: (https:\/\/\S+)/)?.[1];
      if (!profile) continue;
      const { parseClientSocialProfile } = await import("./client-social-profiles");
      const parsed = parseClientSocialProfile(profile);
      if (!parsed) continue;
      const profileEvidence = personalProfileEvidence(section, `profile-${evidence.length + 1}`);
      if (profileEvidence) evidence.push(profileEvidence);
      const matches = [...section.matchAll(/^- (\S+|Date unavailable) (https:\/\/\S+)\n([\s\S]*?)(?=\n- (?:\S+|Date unavailable) https:\/\/|(?![\s\S]))/gm)].slice(0, 20);
      for (const match of matches) {
        const url = new URL(match[2]!); const profileHost = new URL(profile).hostname.replace(/^www\./, "").replace(/^m\./, "");
        const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
        if (!(host === profileHost || (parsed.platform === "x" && ["x.com", "twitter.com"].includes(host)) || (parsed.platform === "youtube" && ["youtube.com", "youtu.be"].includes(host)))) continue;
        const raw = match[3]!.replace(/^(?:\s*(?:Cover: https:\/\/\S+|Cover storage: \S+|Media type: video)\n)+/, "");
        const frames = raw.match(/^\s*Visual observation \(sampled frames\):\s*(.+)$/m)?.[1]?.trim();
        const image = raw.match(/^\s*Visual observation \(image\):\s*(.+)$/m)?.[1]?.trim();
        const transcript = raw.match(/^\s*Transcript \(audio sample\):\s*(.+)$/m)?.[1]?.trim().slice(0, 3000);
        const visual = [frames, image].filter(Boolean).join(" ").slice(0, 1200);
        const authored = parsed.platform === "linkedin" && /^  Attribution: authored\n/.test(raw);
        const caption = raw.replace(/^  Attribution: authored\n/, "").replace(/^\s*(?:Visual observation \((?:sampled frames|image)\)|Transcript \(audio sample\)|Media cache v1):.*$/gm, "").trim().slice(0, 3000);
        if ((!caption && !visual && !transcript) || evidence.some((item) => item.url === url.href)) continue;
        const basis: PersonalBrandReport["evidence"][number]["basis"] = [];
        if (caption) basis.push("caption");
        if (frames) basis.push("frames");
        if (image) basis.push("image");
        if (transcript) basis.push("transcript");
        evidence.push({ id: `post-${evidence.length + 1}`, platform: parsed.platform, url: url.href, date: match[1] === "Date unavailable" ? null : match[1]!, caption, attribution: authored ? "authored" : personalPostAttribution(caption), ...(visual ? { visualObservation: visual } : {}), ...(transcript ? { transcript } : {}), basis });
      }
    }
    const connectedSnapshot = await admin.from("dossier_documents").select("content,updated_at").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", "Personal brand connected feeds").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const accounts = await admin.from("social_accounts").select("id,platform,status,is_enabled").eq("workspace_id", workspaceId).eq("status", "connected").eq("is_enabled", true);
    if (connectedSnapshot.error || accounts.error) throw new Error("Could not load connected social evidence");
    const permittedAccounts = new Map((accounts.data ?? []).map((a) => [a.id, a.platform]));
    const hosts: Record<string, string[]> = { instagram: ["instagram.com"], facebook: ["facebook.com", "fb.com"], tiktok: ["tiktok.com"], youtube: ["youtube.com", "youtu.be"], x: ["x.com", "twitter.com"] };
    try {
      const snapshot = JSON.parse(connectedSnapshot.data?.content || "null");
      for (const channel of Array.isArray(snapshot?.channels) ? snapshot.channels : []) {
        if (!channel || permittedAccounts.get(channel.accountId) !== channel.platform || !hosts[channel.platform] || channel.status !== "available") continue;
        for (const post of (Array.isArray(channel.posts) ? channel.posts : []).slice(0, 20)) {
          if (!post || typeof post.url !== "string" || typeof post.caption !== "string" || !post.caption.trim() || typeof post.date !== "string") continue;
          const date = Date.parse(post.date); if (!Number.isFinite(date) || date > Date.now() || Date.now() - date > CONNECTED_EVIDENCE_DAYS * 86400000) continue;
          let url: URL; try { url = new URL(post.url); } catch { continue; }
          if (url.protocol !== "https:" || url.username || url.password || !hosts[channel.platform]!.some((host) => url.hostname === host || url.hostname.endsWith("." + host)) || evidence.some((item) => item.url === url.href)) continue;
          evidence.push({ id: `post-${evidence.length + 1}`, platform: channel.platform, url: url.href, date: post.date, caption: post.caption.trim().slice(0, 3000), attribution: connectedPostAttribution(channel.platform, post.caption), basis: ["caption"] });
        }
      }
    } catch { /* Invalid snapshots are never treated as evidence. */ }
    if (!evidence.length) throw new Error("No retrievable social posts are available to review yet.");
    const goalsResult = await admin.from("dossier_documents").select("content,updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", PERSONAL_GOALS_TITLE).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (goalsResult.error) throw new Error("Could not load your goals");
    const goals = parsePersonalGoals(goalsResult.data?.content);
    const correctionsResult = await admin.from("dossier_documents").select("content,updated_at").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", "Personal brand corrections (user supplied)").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (correctionsResult.error) throw new Error("Could not load your corrections");
    const corrections = correctionsResult.data?.content?.slice(0, 4000) ?? "";
    const { aiChat } = await import("./dossier.server");
    const result = await aiChat({ model: "gpt-5.4-mini", reasoning_effort: "low", messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ evidence, userGoals: goals, userCorrections: corrections }) }], response_format: { type: "json_object" } });
    const generated = JSON.parse(result.choices?.[0]?.message?.content ?? "{}");
    const report = validatePersonalBrandReport({ ...(limitPersonalFindingCitations(generated) as object), version: 1, generatedAt: new Date().toISOString(), evidence });
    const latestSource = await operations.from("brand_work_operations").select("updated_at,status").eq("workspace_id", workspaceId).eq("kind", "personal-discovery").eq("signature", "v1").maybeSingle();
    if (latestSource.error || !personalSourceIsCurrent(source.data?.updated_at, latestSource.data?.updated_at, latestSource.data?.status)) throw new Error("Social evidence changed during review; refresh again.");
    const latestAccounts = await admin.from("social_accounts").select("id,platform,status,is_enabled").eq("workspace_id", workspaceId).eq("status", "connected").eq("is_enabled", true);
    const accountKey = (rows: { id: string; platform: string }[]) => JSON.stringify(rows.map((a) => `${a.id}:${a.platform}`).sort());
    if (latestAccounts.error || accountKey(latestAccounts.data ?? []) !== accountKey(accounts.data ?? [])) throw new Error("Connected accounts changed during review; refresh again.");
    const latestCorrections = await admin.from("dossier_documents").select("updated_at").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", "Personal brand corrections (user supplied)").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (latestCorrections.error || (latestCorrections.data?.updated_at ?? null) !== (correctionsResult.data?.updated_at ?? null)) throw new Error("Your corrections changed during review; refresh again.");
    const latestGoals = await admin.from("dossier_documents").select("updated_at").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", PERSONAL_GOALS_TITLE).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (latestGoals.error || (latestGoals.data?.updated_at ?? null) !== (goalsResult.data?.updated_at ?? null)) throw new Error("Your goals changed during review; refresh again.");
    const latestConnected = await admin.from("dossier_documents").select("updated_at").eq("workspace_id", workspaceId).eq("source", "paste").eq("title", "Personal brand connected feeds").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (latestConnected.error || (latestConnected.data?.updated_at ?? null) !== (connectedSnapshot.data?.updated_at ?? null)) throw new Error("Connected social evidence changed during review; refresh again.");
    if (!(await commitPersonalLease(operations, key, token, report))) return { busy: true };
    return { busy: false };
  } catch (error) {
    await operations.from("brand_work_operations").update({ status: "failed", updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running");
    throw error;
  }
});

export const generatePersonalBrandReport = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canEdit } = await personalBrandContext(data.workspace_id);
    if (!canEdit) throw new Error("Only workspace managers can refresh the review");
    const discovery = await (admin as any).from("brand_work_operations").select("updated_at").eq("workspace_id", data.workspace_id).eq("kind", KIND_DISCOVERY).eq("status", "running").order("updated_at", { ascending: false }).limit(1);
    if (discovery.error) throw new Error("Could not check social review progress");
    if (discovery.data?.some((item: { updated_at: string }) => Date.now() - Date.parse(item.updated_at) < STALE_MS)) return { busy: true };
    const { runAutomaticBrandDiscovery } = await import("./brand-discovery.server");
    waitUntil(runAutomaticBrandDiscovery(data.workspace_id, user.id, true).catch((error) => console.warn("Personal brand review refresh failed", error instanceof Error ? error.message : "Unknown error")));
    return { busy: true };
  });

/** Retry one saved public profile while retaining the other collected sections. */
export const retryPersonalBrandProfile = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.extend({ profile_url: z.string().max(2000) }).parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canEdit } = await personalBrandContext(data.workspace_id);
    if (!canEdit) throw new Error("Only workspace managers can refresh the review");
    const workspace = await admin.from("workspaces").select("social_profiles").eq("id", data.workspace_id).single();
    if (workspace.error) throw new Error("Could not load saved profiles");
    const { selectedProfiles } = await import("./brand-discovery.server");
    const profiles = selectedProfiles(workspace.data.social_profiles, 20);
    if (!profiles.some((profile) => profile.url === data.profile_url)) throw new Error("This profile is no longer saved in the workspace");
    const snapshot = await (admin as any).from("brand_work_operations").select("result,status,updated_at").eq("workspace_id", data.workspace_id).eq("kind", KIND_DISCOVERY).eq("signature", SIGNATURE).maybeSingle();
    if (snapshot.error) throw new Error("Could not load social review progress");
    if (snapshot.data && personalLeaseIsActive(snapshot.data.status, snapshot.data.updated_at)) return { busy: true };
    const urls = profiles.map((profile) => profile.url || (["instagram", "facebook", "tiktok"].includes(profile.platform) ? `https://www.${profile.platform}.com/${profile.platform === "tiktok" ? "@" : ""}${profile.handle}` : `${profile.platform}:@${profile.handle}`));
    const { reusablePersonalSections } = await import("./personal-retry");
    if (!reusablePersonalSections(snapshot.data?.result?.content ?? "", urls)) throw new Error("Saved profiles changed. Update the full review instead.");
    const { runPersonalDiscovery } = await import("./personal-discovery.server");
    waitUntil(runPersonalDiscovery(data.workspace_id, user.id, true, 0, data.profile_url).catch((error) => console.warn("Personal profile retry failed", error instanceof Error ? error.message : "Unknown error")));
    return { busy: true };
  });

/** Poll persisted job state without discarding the most recent successful report. */
export const getPersonalBrandReviewStatus = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { admin, canEdit } = await personalBrandContext(data.workspace_id);
    const row = await (admin as any).from("brand_work_operations").select("status,updated_at,result").eq("workspace_id", data.workspace_id).eq("kind", KIND).eq("signature", SIGNATURE).maybeSingle();
    if (row.error) throw new Error("Could not check your review status");
    const discovery = await (admin as any).from("brand_work_operations").select("status,updated_at").eq("workspace_id", data.workspace_id).eq("kind", "personal-discovery").eq("signature", "v1").maybeSingle();
    if (discovery.error) throw new Error("Could not check social review progress");
    const discoveryActive = discovery.data && personalLeaseIsActive(discovery.data.status, discovery.data.updated_at);
    const discoveryInterrupted = discovery.data?.status === "running" && !discoveryActive;
    const discoveryFailed = discovery.data?.status === "failed";
    const stale = row.data?.status === "running" && Date.now() - Date.parse(row.data.updated_at) >= STALE_MS;
    let generatedAt: string | null = null;
    if (row.data?.result) { try { generatedAt = validatePersonalBrandReport(row.data.result).generatedAt; } catch { /* Ignore invalid results. */ } }
    return { status: discoveryActive ? "running" : discoveryInterrupted || stale ? "interrupted" : discoveryFailed ? "failed" : row.data?.status ?? "not_started", updatedAt: row.data?.updated_at ?? null, generatedAt, canEdit };
  });

/** Start at most one stale refresh; claim is acquired by the persistent worker. */
export const refreshStalePersonalBrandReview = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canEdit } = await personalBrandContext(data.workspace_id);
    if (!canEdit) return { queued: false };
    const row = await (admin as any).from("brand_work_operations").select("status,updated_at,result").eq("workspace_id", data.workspace_id).eq("kind", KIND).eq("signature", SIGNATURE).maybeSingle();
    if (row.error) throw new Error("Could not check your review status");
    const now = Date.now();
    if (row.data?.status === "running" && now - Date.parse(row.data.updated_at) < STALE_MS) return { queued: false };
    // Avoid retry loops after failures. The manual button remains available.
    if (row.data?.status === "failed" && now - Date.parse(row.data.updated_at) < 24 * 60 * 60_000) return { queued: false };
    if (row.data?.result) {
      const connected = await admin.from("dossier_documents").select("updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", "Personal brand connected feeds").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const savedDiscovery = await (admin as any).from("brand_work_operations").select("status,updated_at").eq("workspace_id", data.workspace_id).eq("kind", KIND_DISCOVERY).eq("signature", SIGNATURE).maybeSingle();
      if (connected.error || savedDiscovery.error) throw new Error("Could not check social evidence freshness");
      try {
        const report = validatePersonalBrandReport(row.data.result); const generated = Date.parse(report.generatedAt);
        const changed = (connected.data?.updated_at && Date.parse(connected.data.updated_at) > generated) || (savedDiscovery.data?.status === "complete" && Date.parse(savedDiscovery.data.updated_at) > generated);
        if (!changed && now - generated < 7 * 24 * 60 * 60_000) return { queued: false };
      } catch { /* Rebuild invalid results. */ }
    }
    const discovery = await (admin as any).from("brand_work_operations").select("updated_at").eq("workspace_id", data.workspace_id).eq("kind", "personal-discovery").eq("status", "running").order("updated_at", { ascending: false }).limit(1);
    if (discovery.error) throw new Error("Could not check social review progress");
    if (discovery.data?.some((item: { updated_at: string }) => now - Date.parse(item.updated_at) < STALE_MS)) return { queued: false };
    const { runAutomaticBrandDiscovery } = await import("./brand-discovery.server");
    waitUntil(runAutomaticBrandDiscovery(data.workspace_id, user.id, true).catch((error) => console.warn("Personal brand discovery refresh failed", error instanceof Error ? error.message : "Unknown error")));
    return { queued: true };
  });

const goalsInput = z.union([input.extend({ brief: goalsBriefSchema }), input.merge(guidedGoalsSchema)]);
async function personalGoalsContext(workspaceId: string) {
  const context = await workspaceBrandContext(workspaceId, "any");
  if (!context.personal) {
    const workspace = await context.admin.from("workspaces").select("social_profiles").eq("id", workspaceId).maybeSingle();
    if (workspace.error || !personalLinkedIn(workspace.data?.social_profiles)) throw new Error("Add a personal LinkedIn profile to use personal goals.");
  }
  return context;
}
export const getPersonalBrandGoals = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { admin, canEdit } = await personalGoalsContext(data.workspace_id);
    const result = await admin.from("dossier_documents").select("content").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", PERSONAL_GOALS_TITLE).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Could not load your goals");
    return { ...parsePersonalGoals(result.data?.content), canEdit };
  });
export const savePersonalBrandGoals = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => goalsInput.parse(value))
  .handler(async ({ data }) => {
    const { admin, user, canEdit } = await personalGoalsContext(data.workspace_id);
    if (!canEdit) throw new Error("Only workspace managers can edit goals");
    const existing = await admin.from("dossier_documents").select("id,content,updated_at").eq("workspace_id", data.workspace_id).eq("source", "paste").eq("title", PERSONAL_GOALS_TITLE).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw new Error("Could not save your goals");
    const { workspace_id, ...update } = data;
    const goals = { ...parsePersonalGoals(existing.data?.content), ...update };
    const content = JSON.stringify(goals);
    const documents = admin.from("dossier_documents");
    let saved;
    if (existing.data) {
      const updated_at = new Date(Math.max(Date.now(), Date.parse(existing.data.updated_at) + 1)).toISOString();
      saved = await documents.update({ content, updated_at }).eq("id", existing.data.id).eq("workspace_id", workspace_id).eq("updated_at", existing.data.updated_at).select("content").maybeSingle();
    } else {
      // A stable id makes simultaneous first saves conflict instead of creating two goals documents.
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(`${PERSONAL_GOALS_TITLE}:${workspace_id}`).digest("hex");
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      saved = await documents.insert({ id, workspace_id, source: "paste", title: PERSONAL_GOALS_TITLE, content, created_by: user.id }).select("content").maybeSingle();
    }
    if (saved.error || saved.data?.content !== content) throw new Error("Could not verify your goals were saved. Please try again.");
    return { saved: true, goals };
  });

export const formatPersonalGoalsBrief = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.extend({ brief: goalsBriefSchema.pipe(z.string().min(1)) }).parse(value))
  .handler(async ({ data }) => {
    const { canEdit } = await personalGoalsContext(data.workspace_id);
    if (!canEdit) throw new Error("Only workspace managers can organize the goals brief.");
    const { organizeGoalsBrief } = await import("./personal-goals-brief.server");
    return { brief: await organizeGoalsBrief(data.brief) };
  });
