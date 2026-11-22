import type { Database, Json } from "@/integrations/supabase/types";
import { getAdminClient } from "./supabase-admin.server";
import { creativeSettingsDuration, getCreativeCapability, validateCreativeSettings } from "./creative-providers/registry";

export type AssetRow = Database["public"]["Tables"]["creative_variants"]["Row"];
export type RenderRow = Database["public"]["Tables"]["render_jobs"]["Row"];
type Admin = ReturnType<typeof getAdminClient>;

const BRIEF_KEYS = ["hook", "angle", "narrative", "argument", "format", "beats", "voiceover", "script", "caption", "cta", "duration_s", "size", "voice_id", "file_ids", "captions", "composition_html", "build_prompt", "build_report", "design_mode", "opening_visual", "review_state", "review_note", "version", "production_plan"] as const;
const NULLABLE_KEYS = new Set<string>(["argument", "voice_id", "composition_html", "build_prompt", "build_report", "design_mode", "opening_visual", "review_note"]);

/** Capture creative input, never workspace IDs, ownership or scheduling. */
export function assetBriefPatch(asset: AssetRow): Pick<AssetRow, typeof BRIEF_KEYS[number]> {
  return Object.fromEntries(BRIEF_KEYS.map((key) => [key, asset[key]])) as Pick<AssetRow, typeof BRIEF_KEYS[number]>;
}

export function assetBriefSnapshot(asset: AssetRow): Json {
  return assetBriefPatch(asset) as Json;
}

export function snapshotRecord(value: Json | null | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/** Keep a direct provider film's approved length and saved request in agreement. */
export function withAssetDuration(asset: AssetRow, duration: number): AssetRow {
  const next = { ...asset, duration_s: duration };
  const plan = snapshotRecord(asset.production_plan);
  if (!snapshotRecord(plan?.["direct_video"]) || !Array.isArray(plan?.["steps"]) || plan["steps"].length !== 1) return next;
  const step = snapshotRecord(plan["steps"][0]);
  const settings = snapshotRecord(step?.["settings"]);
  if (step?.["role"] !== "finished_video" || typeof step["capability_id"] !== "string" || !settings) return next;
  const capability = getCreativeCapability(step["capability_id"]);
  if (!capability.controls?.some((control) => control.key === "duration")) throw new Error("This provider cannot change the finished film's duration. Choose a new supported production route.");
  const oldDuration = settings["duration"];
  const prompt = typeof settings["prompt"] === "string" && typeof oldDuration === "number"
    ? settings["prompt"].replace(new RegExp(`\\b${oldDuration}(-second\\b|\\s+seconds?\\b)`, "gi"), `${duration}$1`)
    : settings["prompt"];
  const updated: Record<string, Json | undefined> = { ...settings, duration, ...(prompt !== undefined ? { prompt } : {}) };
  // Stored plans contain authorised IDs rather than signed URLs. Stand-ins only
  // validate the schema here; the worker resolves and checks real inputs later.
  const refs = Array.isArray(step["reference_file_ids"]) ? step["reference_file_ids"] : [];
  const needsImageReferences = capability.controls?.some((control) => control.key === "image_urls");
  const checked = validateCreativeSettings(capability.id, { ...updated, ...(needsImageReferences && refs.length && updated["image_urls"] === undefined ? { image_urls: refs.map((_, i) => `https://references.example.com/${i}.jpg`) } : {}) });
  if (creativeSettingsDuration(checked) !== duration) throw new Error("This provider cannot deliver the requested finished duration.");
  const direction = snapshotRecord(plan["direction"]);
  next.production_plan = { ...plan, steps: [{ ...step, settings: updated }], ...(direction ? { direction: { ...direction, pacing: `Deliver exactly ${duration} seconds.` } } : {}) } as Json;
  return next;
}

export function hasBriefSnapshot(value: Json | null | undefined): boolean {
  const raw = snapshotRecord(value);
  return !!raw && typeof raw["hook"] === "string" && typeof raw["voiceover"] === "string" && typeof raw["duration_s"] === "number" && Array.isArray(raw["beats"]);
}

/** Only trusted creative fields may be restored from a stored version. */
export function assetWithSnapshot(asset: AssetRow, snapshot: Json | null | undefined): AssetRow {
  const raw = snapshotRecord(snapshot);
  if (!raw) return { ...asset };
  const restored = { ...asset };
  for (const key of BRIEF_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    const current = asset[key];
    if (value === null && NULLABLE_KEYS.has(key)) (restored as unknown as Record<string, unknown>)[key] = null;
    else if (key === "beats" || key === "build_report" || key === "production_plan") (restored as unknown as Record<string, unknown>)[key] = value;
    else if (key === "file_ids" && Array.isArray(value) && value.every((item) => typeof item === "string")) restored.file_ids = value as string[];
    else if (typeof value === typeof current || (value === null && current === null) || (current === null && typeof value === "string")) (restored as unknown as Record<string, unknown>)[key] = value;
  }
  return restored;
}

export function snapshotForRender(asset: AssetRow, render: RenderRow): Json | null {
  const snapshot = render.brief_snapshot ?? (render.version === asset.version ? assetBriefSnapshot(asset) : null);
  const raw = snapshotRecord(snapshot);
  return raw ? { ...raw, ...(render.composition_html ? { composition_html: render.composition_html } : {}) } : null;
}

/** Freeze the current brief before any edit can replace it. */
export async function preserveAssetBrief(admin: Admin, asset: AssetRow) {
  const { error } = await admin.from("render_jobs").update({ brief_snapshot: assetBriefSnapshot(asset) }).eq("variant_id", asset.id).eq("version", asset.version).is("brief_snapshot", null);
  if (error) throw new Error(error.message);
}

export async function resolvePrimaryRender(admin: Admin, id: string) {
  const { data: asset, error } = await admin.from("creative_variants").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!asset) return null;
  let render: RenderRow | null = null;
  if (asset.primary_render_id) {
    const result = await admin.from("render_jobs").select("*").eq("id", asset.primary_render_id).eq("variant_id", id).eq("status", "done").not("storage_path", "is", null).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    render = result.data;
  }
  if (!render) {
    const result = await admin.from("render_jobs").select("*").eq("variant_id", id).eq("status", "done").not("storage_path", "is", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    render = result.data;
  }
  return { asset, render, brief: render ? assetWithSnapshot(asset, snapshotForRender(asset, render)) : asset };
}

export async function renderLinks(admin: Admin, render: RenderRow, title: string) {
  const path = render.storage_path;
  if (render.status !== "done" || !path) throw new Error("This version is still being made.");
  if (path.startsWith("autotoast:")) {
    const { getMedia } = await import("./render.server");
    const media = await getMedia(path.slice(10));
    return { url: media.playback_url ?? media.download_url ?? null, download_url: media.download_url ?? null };
  }
  const filename = `${title.slice(0, 60).replace(/[^\w ]+/g, "") || "video"}.mp4`;
  const [play, download] = await Promise.all([
    admin.storage.from("brand-assets-private").createSignedUrl(path, 3600),
    admin.storage.from("brand-assets-private").createSignedUrl(path, 3600, { download: filename }),
  ]);
  if (play.error || download.error) throw new Error("This video is temporarily unavailable.");
  return { url: play.data?.signedUrl ?? null, download_url: download.data?.signedUrl ?? null };
}
