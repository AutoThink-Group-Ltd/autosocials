import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { ResearchTargetSchema, type ResearchRun } from "./research";
import { analyzeResearch, authorizeResearch, loadResearchRun } from "./research.server";
import { getAdminClient } from "./supabase-admin.server";
import { researchNicheTrends, type ResearchTrend } from "./research-trends.server";
import { beginVisualShare, VisualReportSchema } from "./research-visual.server";

type Row = Record<string, unknown>;
type ShareSchema = { public: { Tables: { research_report_shares: { Row: Row; Insert: Row; Update: Row; Relationships: [] } }; Views: Record<never, never>; Functions: Record<never, never> } };
const shares = () => getAdminClient() as unknown as SupabaseClient<ShareSchema>;

const PublicPostSchema = z.object({
  id: z.string(), platform: z.enum(["instagram", "facebook", "tiktok"]),
  profile_url: z.string().optional(), url: z.string(), caption: z.string(),
  published_at: z.string().nullable(), thumbnail_url: z.string().nullable(),
  media_type: z.enum(["image", "video", "carousel", "unknown"]),
  metrics: z.object({ likes: z.number().nullable().optional(), comments: z.number().nullable().optional(), views: z.number().nullable().optional(), shares: z.number().nullable().optional() }),
  review_basis: z.enum(["frames", "thumbnail", "metadata"]),
});
const PublicAnalysisSchema = z.object({
  summary: z.string(),
  findings: z.array(z.object({ title: z.string(), body: z.string(), post_ids: z.array(z.string()) })),
  treatment: z.object({ title: z.string(), hook: z.string(), beats: z.array(z.string()), rationale: z.string() }),
});
const PublicVisualSchema = VisualReportSchema.omit({ manual_competitor_urls: true, job_id: true });
const PublicSnapshotSchema = z.object({
  id: z.string(), query: z.string(), status: z.enum(["complete", "partial"]),
  created_at: z.string(), updated_at: z.string(),
  targets: z.array(ResearchTargetSchema), posts: z.array(PublicPostSchema),
  analysis: PublicAnalysisSchema.nullable(),
  visual: VisualReportSchema.optional(),
});
export type PublicResearchSnapshot = z.infer<typeof PublicSnapshotSchema>;
export type PublicResearchShare = {
  run: ResearchRun;
  trends: ResearchTrend[];
  visual: z.infer<typeof PublicVisualSchema>;
  brief_status: "pending" | "ready" | "unavailable";
  trend_status: "pending" | "ready" | "unavailable";
  niche?: string;
  checked_at?: string;
};

/** Only fields intended for the client briefing cross the public share boundary. */
export function makePublicResearchSnapshot(run: ResearchRun, publicId = run.id): PublicResearchSnapshot {
  return PublicSnapshotSchema.parse({
    id: publicId,
    query: run.targets.map((target) => target.display_name || `@${target.handle}`).join(" · "),
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    targets: run.targets,
    posts: run.posts.map((post) => ({ ...post, review_basis: "metadata" })),
    // The workspace analysis may contain the private client question. Never reuse it.
    analysis: null,
  });
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function finishShareTrends(id: string, run: ResearchRun) {
  try {
    // This run has already passed through the public allowlist: no client email or reply.
    const result = await researchNicheTrends(run);
    const update = await shares().from("research_report_shares").update({
      trends: result.trends, trend_status: result.status, niche: result.niche,
      checked_at: result.checked_at, updated_at: new Date().toISOString(),
    }).eq("id", id).is("revoked_at", null);
    if (update.error) throw update.error;
  } catch {
    await shares().from("research_report_shares").update({ trend_status: "unavailable", updated_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  }
}

async function finishShareBrief(id: string, snapshot: PublicResearchSnapshot) {
  try {
    const run = toPublicRun(snapshot);
    // The public snapshot has no sampled frames; only its public covers can be reviewed.
    for (const post of run.posts) post.review_basis = post.thumbnail_url ? "thumbnail" : "metadata";
    const analysis = await analyzeResearch(run);
    const publicSnapshot = PublicSnapshotSchema.parse({ ...snapshot, posts: run.posts, analysis });
    const update = await shares().from("research_report_shares").update({
      snapshot: publicSnapshot, brief_status: "ready", updated_at: new Date().toISOString(),
    }).eq("id", id).is("revoked_at", null);
    if (update.error) throw update.error;
  } catch {
    await shares().from("research_report_shares").update({ brief_status: "unavailable", updated_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  }
}

function toPublicRun(snapshot: PublicResearchSnapshot): ResearchRun {
  // Empty compatibility fields contain no saved private content.
  const publicFields = { ...snapshot };
  delete publicFields.visual;
  return { ...publicFields, question: "", errors: [], reply: null, analysis: snapshot.analysis ? { ...snapshot.analysis, reply: "" } : null } as ResearchRun;
}

export async function createResearchShareRecord(workspaceId: string, runId: string): Promise<{ token: string }> {
  const user = await authorizeResearch(workspaceId);
  const row = await loadResearchRun(workspaceId, runId);
  if (!["complete", "partial"].includes(String(row["status"])) || !Array.isArray(row["posts"]) || !row["posts"].length) throw new Error("Wait for public posts to finish collecting before sharing.");
  const id = randomUUID();
  const publicSnapshot = makePublicResearchSnapshot({
    id: runId, query: String(row["query"] ?? ""), question: "", status: row["status"] as ResearchRun["status"],
    created_at: String(row["created_at"]), updated_at: String(row["updated_at"]),
    targets: row["targets"] as ResearchRun["targets"], posts: row["posts"] as ResearchRun["posts"],
    analysis: null, errors: [],
  }, id);
  const snapshot = PublicSnapshotSchema.parse({ ...publicSnapshot, visual: {
    status: "pending", progress: "Preparing the visual landscape…", updated_at: new Date().toISOString(),
    competitors: [], examples: [], comparisons: [], styles: [], directions: [],
    manual_competitor_urls: null,
  } });
  const existing = await shares().from("research_report_shares")
    .select("active_slot,trends,trend_status,niche,checked_at")
    .eq("workspace_id", workspaceId).eq("research_run_id", runId).is("revoked_at", null);
  if (existing.error) throw new Error("Could not check the report links.");
  const usedSlots = new Set((existing.data ?? []).map((share) => Number(share["active_slot"])));
  const activeSlot = Array.from({ length: 10 }, (_, index) => index + 1).find((slot) => !usedSlots.has(slot));
  if (!activeSlot) throw new Error("This report already has 10 active links. Deactivate its links before creating another.");
  const cached = existing.data?.find((share) => share["trend_status"] === "ready" && typeof share["checked_at"] === "string" && Date.now() - Date.parse(share["checked_at"]) < 86_400_000);
  const token = randomBytes(32).toString("hex");
  const result = await shares().from("research_report_shares").insert({
    id, workspace_id: workspaceId, research_run_id: runId, created_by: user.id,
    token_hash: tokenHash(token), active_slot: activeSlot, snapshot,
    trends: cached?.["trends"] ?? [], trend_status: cached ? "ready" : "pending", brief_status: "pending",
    niche: cached?.["niche"] ?? null, checked_at: cached?.["checked_at"] ?? null,
  });
  if (result.error?.code === "23505") throw new Error("A report link was just created. Please try again.");
  if (result.error) throw new Error("Could not create the report link.");
  try {
    waitUntil(Promise.all([
      finishShareBrief(id, snapshot).then(() => beginVisualShare(id, snapshot)),
      cached ? Promise.resolve() : finishShareTrends(id, toPublicRun(snapshot)),
    ]));
  } catch {
    await shares().from("research_report_shares").update({ brief_status: "unavailable", ...(cached ? {} : { trend_status: "unavailable" }) }).eq("id", id);
  }
  return { token };
}

export async function loadPublicResearchShare(token: string): Promise<PublicResearchShare | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await shares().from("research_report_shares")
    .select("snapshot,trends,trend_status,brief_status,niche,checked_at,created_at")
    .eq("token_hash", tokenHash(token)).is("revoked_at", null).maybeSingle();
  if (result.error) throw new Error("Could not load the report.");
  if (!result.data) return null;
  const snapshot = PublicSnapshotSchema.safeParse(result.data["snapshot"]);
  if (!snapshot.success) return null;
  const status = result.data["trend_status"];
  const briefStatus = result.data["brief_status"];
  const pendingStale = Date.now() - Date.parse(String(result.data["created_at"])) > 180_000;
  const visual = snapshot.data.visual ?? {
    status: "unavailable" as const, competitors: [], examples: [], comparisons: [], styles: [], directions: [],
  };
  const visualStale = visual.status === "pending" && Date.now() - Date.parse(visual.updated_at ?? String(result.data["created_at"])) > 300_000;
  return {
    run: toPublicRun({ ...snapshot.data, analysis: briefStatus === "ready" ? snapshot.data.analysis : null }),
    brief_status: briefStatus === "ready" && snapshot.data.analysis ? "ready" : briefStatus === "unavailable" || pendingStale ? "unavailable" : "pending",
    trends: Array.isArray(result.data["trends"]) ? result.data["trends"] as ResearchTrend[] : [],
    visual: PublicVisualSchema.parse(visualStale ? { ...visual, status: "unavailable", progress: "The visual scan timed out. Regenerate it from Social Lens." } : visual),
    trend_status: status === "ready" || status === "unavailable" ? status : pendingStale ? "unavailable" : "pending",
    ...(typeof result.data["niche"] === "string" ? { niche: result.data["niche"] } : {}),
    ...(typeof result.data["checked_at"] === "string" ? { checked_at: result.data["checked_at"] } : {}),
  };
}

export async function revokeResearchShareRecords(workspaceId: string, runId: string) {
  await authorizeResearch(workspaceId);
  await loadResearchRun(workspaceId, runId);
  const result = await shares().from("research_report_shares").update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId).eq("research_run_id", runId).is("revoked_at", null);
  if (result.error) throw new Error("Could not deactivate the report links.");
  return { ok: true };
}
