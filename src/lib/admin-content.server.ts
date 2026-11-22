import type { getAdminClient } from "./supabase-admin.server";
import type { AdminContentResult } from "./admin-content.functions";
import type { Json } from "@/integrations/supabase/types";
import { getCreativeCapability, listCreativeCapabilities } from "./creative-providers/registry";
import { MAX_PROVIDER_STEPS } from "./production-plan";

type Admin = ReturnType<typeof getAdminClient>;
const PAGE_SIZE = 24;
const record = (value: Json | null): Record<string, Json | undefined> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export const adminContentOwnedPath = (path: string, workspace: string) => path.startsWith(`${workspace}/`) && !/[\\?#\r\n]/.test(path) && !path.split("/").some((part) => !part || part === "." || part === "..");

async function requireSuperAdmin(admin: Admin, userId: string) {
  const { data, error } = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

function frozenModels(brief: Record<string, Json | undefined>): string | null {
  const plan = record(brief["production_plan"] ?? null);
  if (!Array.isArray(plan["steps"])) return null;
  const models = plan["steps"].flatMap((value) => {
    const step = record(value);
    const id = text(step["capability_id"]);
    if (!id) return [];
    try { const capability = getCreativeCapability(id); return [`${capability.provider} · ${capability.label}`]; }
    catch { return [id]; }
  });
  return [...new Set(models)].join(" / ") || null;
}

/** Match known saved capability IDs without searching prompt/reference contents. */
function modelFilters(value: string): string[] {
  const safe = value.replace(/[^\p{L}\p{N} _./-]/gu, "").trim();
  if (!safe) return [];
  const terms = [`model.ilike.%${safe.replace(/_/g, "\\_")}%`];
  const ids = listCreativeCapabilities().filter((cap) => `${cap.id} ${cap.provider} ${cap.label} ${cap.endpoint ?? ""}`.toLowerCase().includes(safe.toLowerCase())).map((cap) => cap.id);
  if (ids.length) for (let i = 0; i < MAX_PROVIDER_STEPS; i++) terms.push(`brief_snapshot->production_plan->steps->${i}->>capability_id.in.(${ids.join(",")})`);
  return terms;
}

/** Every completed render is a separate library entry, including older versions. */
export async function readAdminContent(admin: Admin, userId: string, input: { page: number; search: string; model: string }): Promise<AdminContentResult> {
  await requireSuperAdmin(admin, userId);
  let query = admin.from("render_jobs").select("id,workspace_id,model,version,created_at,updated_at,status,brief_snapshot,workspaces(name),creative_variants!render_jobs_variant_id_fkey(hook,duration_s,size)", { count: "exact" })
    .eq("status", "done").not("storage_path", "is", null).neq("storage_path", "");
  const search = input.search.replace(/[^\p{L}\p{N} _./-]/gu, "").trim();
  if (search) query = query.or([`brief_snapshot->>hook.ilike.%${search.replace(/_/g, "\\_")}%`, ...modelFilters(search)].join(","));
  const models = modelFilters(input.model);
  if (models.length) query = query.or(models.join(","));
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(input.page * PAGE_SIZE, (input.page + 1) * PAGE_SIZE - 1);
  if (error) throw new Error("Couldn't load the video library.");
  return { pageSize: PAGE_SIZE, total: count ?? 0, videos: (data ?? []).map((row) => {
    const brief = record(row.brief_snapshot);
    return { id: row.id, title: text(brief["hook"]) ?? row.creative_variants?.hook ?? "Untitled video", workspaceId: row.workspace_id, workspace: row.workspaces?.name ?? "Unknown workspace", model: frozenModels(brief) ?? row.model,
      version: row.version, duration: number(brief["duration_s"]) ?? row.creative_variants?.duration_s ?? null, size: text(brief["size"]) ?? row.creative_variants?.size ?? null,
      createdAt: row.created_at, completedAt: row.updated_at, status: row.status, snapshot: !!text(brief["hook"]) };
  }) };
}

/** Never accept a client-provided path/media ID for privileged signing. */
export async function readAdminContentLinks(admin: Admin, userId: string, renderId: string) {
  await requireSuperAdmin(admin, userId);
  const { data: row, error } = await admin.from("render_jobs").select("id,workspace_id,status,storage_path,version,provider_job_id").eq("id", renderId).single();
  if (error || !row || row.status !== "done" || !row.storage_path) throw new Error("This completed video is unavailable.");
  const path = row.storage_path;
  if (path.startsWith("autotoast:")) {
    const id = path.slice(10);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid stored video reference.");
    const { getMedia } = await import("./render.server");
    const media = await getMedia(id);
    const ownedUpload = media.workspace_id === row.workspace_id;
    const ownedRender = media.kind === "render" && !!row.provider_job_id && media.render_job_id === row.provider_job_id;
    if ((!ownedUpload && !ownedRender) || media.status !== "ready") throw new Error("This video's storage record could not be verified.");
    const playback = media.playback_url ?? media.download_url;
    if (!playback && !media.download_url) throw new Error("This video is temporarily unavailable.");
    return { playback, download: media.download_url, expiresAt: null };
  }
  if (!adminContentOwnedPath(path, row.workspace_id)) throw new Error("Invalid stored video path.");
  const filename = `video-${row.id}${row.version == null ? "" : `-v${row.version}`}.mp4`;
  const bucket = admin.storage.from("brand-assets-private");
  const [play, download] = await Promise.all([bucket.createSignedUrl(path, 900), bucket.createSignedUrl(path, 900, { download: filename })]);
  if (play.error || download.error || !play.data?.signedUrl || !download.data?.signedUrl) throw new Error("This video is temporarily unavailable.");
  return { playback: play.data.signedUrl, download: download.data.signedUrl, expiresAt: Date.now() + 900_000 };
}
