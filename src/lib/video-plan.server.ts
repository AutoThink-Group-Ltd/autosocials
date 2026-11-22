import type { getAdminClient } from "./supabase-admin.server";
import { assetBriefSnapshot, hasBriefSnapshot, snapshotRecord } from "./asset-versions.server";
import { readProductionPlan } from "./production-plan";
import { getCreativeCapability } from "./creative-providers/registry";
import { listRenderSteps } from "./generation-tracker.server";
import { sanitizeGenerationSettings } from "./generation-tracker";
import type { VideoPlan, VideoPlanReference } from "./video-plan";

type Admin = ReturnType<typeof getAdminClient>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const isPlanOwnedPath = (path: string, workspace: string) => path.startsWith(`${workspace}/`) && !/[\\?#\r\n]/.test(path) && !path.split("/").some((part) => !part || part === "." || part === "..");

export async function readVideoPlan(admin: Admin, userId: string, input: { variant_id: string; render_id?: string }): Promise<VideoPlan> {
  const assetResult = await admin.from("creative_variants").select("*").eq("id", input.variant_id).single();
  const asset = assetResult.data;
  if (assetResult.error || !asset) throw new Error("Video unavailable.");
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: asset.workspace_id });
  if (access.error || access.data !== true) throw new Error("Forbidden");
  const renderResult = input.render_id ? await admin.from("render_jobs").select("*").eq("id", input.render_id).eq("variant_id", asset.id).eq("workspace_id", asset.workspace_id).single() : null;
  if (renderResult && (renderResult.error || !renderResult.data)) throw new Error("This production attempt is unavailable.");
  const render = renderResult?.data ?? null;
  // A historical presentation must never borrow newer creative instructions.
  if (render && !hasBriefSnapshot(render.brief_snapshot)) throw new Error("The saved plan for this older attempt is unavailable.");
  const brief = snapshotRecord(render ? render.brief_snapshot : assetBriefSnapshot(asset))!;
  const plan = readProductionPlan(brief["production_plan"]);
  const rawPlan = snapshotRecord(brief["production_plan"]);
  const direct = snapshotRecord(rawPlan?.["direct_video"]);
  const fileIds = [...new Set(plan.steps.length ? plan.steps.flatMap((step) => step.reference_file_ids) : strings(brief["file_ids"]))];
  const [ledger, fileResult] = await Promise.all([
    render ? listRenderSteps(render.id, admin) : Promise.resolve([]),
    fileIds.length ? admin.from("brand_files").select("id,name,kind,storage_path,media_id,ai_summary").eq("workspace_id", asset.workspace_id).in("id", fileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (fileResult.error) throw new Error("Reference assets could not be loaded.");
  const state = snapshotRecord(render?.production_state);
  const outputs = snapshotRecord(state?.["outputs"]);
  const sign = async (path: string): Promise<string | null> => {
    if (!isPlanOwnedPath(path, asset.workspace_id)) return null;
    const signed = await admin.storage.from("brand-assets-private").createSignedUrl(path, 900);
    return signed.error ? null : signed.data?.signedUrl ?? null;
  };
  const files = new Map(await Promise.all((fileResult.data ?? []).map(async (file) => {
    let url: string | null = null;
    if (file.media_id && file.storage_path === `autotoast:${file.media_id}`) {
      try { const media = await (await import("./render.server")).getMedia(file.media_id); url = media.playback_url ?? media.download_url; } catch { /* Show unavailable media without hiding the saved plan. */ }
    } else url = await sign(file.storage_path);
    return [file.id, { id: file.id, name: file.name, kind: file.kind === "logo" ? "image" : file.kind, role: "reference", url, description: file.ai_summary ?? "", source: "file", available: true } satisfies VideoPlanReference] as const;
  })));
  const steps = await Promise.all(plan.steps.map(async (step) => {
    const cap = getCreativeCapability(step.capability_id);
    const recorded = ledger.find((row) => row.step_key === `provider:${step.id}`);
    const references: VideoPlanReference[] = step.reference_file_ids.map((id) => ({ ...(files.get(id) ?? { id, name: "Unavailable reference", kind: "unknown", url: null, description: "This selected reference is no longer available.", source: "file" as const, available: false }), role: step.reference_roles?.filter((ref) => ref.source === "file" && ref.id === id).map((ref) => ref.role).join(", ") || "reference" }));
    for (const id of step.reference_step_ids) {
      const output = snapshotRecord(outputs?.[id]);
      const path = text(output?.["path"]);
      // Only show generated media backed by a completed ledger entry in this workspace.
      let url: string | null = null;
      if (path && isPlanOwnedPath(path, asset.workspace_id)) {
        const proof = await admin.from("generation_steps").select("id").eq("workspace_id", asset.workspace_id).eq("variant_id", asset.id).eq("status", "completed").eq("output_storage_path", path).limit(1).maybeSingle();
        if (!proof.error && proof.data) url = await sign(path);
      }
      references.push({ id, name: `Generated ${label(id)}`, kind: text(output?.["kind"]) || "video", role: step.reference_roles?.filter((ref) => ref.source === "step" && ref.id === id).map((ref) => ref.role).join(", ") || "reference", url, description: url ? "Saved output from an earlier production step." : "This input becomes available when its preceding step finishes.", source: "step", available: !!url });
    }
    const settings = sanitizeGenerationSettings(recorded?.settings ?? step.settings);
    return { id: step.id, label: step.purpose, provider: cap.provider, model: cap.label, role: step.role, prompt: text(step.settings["prompt"]), status: recorded?.status ?? "planned", accepted: !!recorded?.provider_job_id, settingsSource: settings["settings_source"] === "resolved_request" ? "resolved_request" as const : "recorded_plan" as const, settings: Object.entries(settings).filter(([key]) => key !== "settings_source").map(([key, value]) => ({ label: label(key), value: typeof value === "boolean" ? value ? "Yes" : "No" : String(value) })), references, dependsOn: step.reference_step_ids, cost: recorded?.cost_amount != null && recorded.cost_currency && recorded.cost_kind !== "unknown" ? { amount: Number(recorded.cost_amount), currency: recorded.cost_currency, kind: recorded.cost_kind } : null };
  }));
  if (!plan.steps.length) {
    const compositor = ledger.find((row) => row.step_key === "compositor");
    steps.push({ id: "compositor", label: "Compose the finished video", provider: "autotoast", model: "AutoToast · composition", role: "finished_video", prompt: "", status: compositor?.status ?? "planned", accepted: !!compositor?.provider_job_id, settingsSource: "recorded_plan", settings: Object.entries(sanitizeGenerationSettings(compositor?.settings)).map(([key, value]) => ({ label: label(key), value: String(value) })), references: fileIds.map((id) => files.get(id) ?? { id, name: "Unavailable reference", kind: "unknown", role: "reference", url: null, description: "This selected reference is no longer available.", source: "file", available: false }), dependsOn: [], cost: compositor?.cost_amount != null && compositor.cost_currency && compositor.cost_kind !== "unknown" ? { amount: Number(compositor.cost_amount), currency: compositor.cost_currency, kind: compositor.cost_kind } : null });
  }
  const buildPrompt = text(brief["build_prompt"]);
  const storyboard = buildPrompt.split(/^### Scene \d+: /m).slice(1).flatMap((chunk) => {
    const body = chunk.split(/^## /m)[0] ?? "";
    const lines = body.trim().split(/\r?\n/);
    const heading = lines[0]?.match(/^(.+) \(([\d.]+)s to ([\d.]+)s\)$/);
    if (!heading || Number(heading[3]) <= Number(heading[2])) return [];
    const fileLine = lines.find((line) => line.startsWith("- Files:")) ?? "";
    return [{ name: heading[1]!, time: heading[2] + "–" + heading[3] + "s", action: lines.slice(1).filter((line) => !line.startsWith("- Files:")).join("\n"), fileIds: fileIds.filter((id) => fileLine.includes(id)) }];
  });
  const report = snapshotRecord(brief["build_report"]);
  const audioIsSilent = direct?.["audio_mode"] === "silent" || (plan.steps.some((step) => step.role === "finished_video") && plan.steps.every((step) => step.settings["generate_audio"] === false || step.settings["sound"] === "off"));
  return { buildPrompt, storyboard, editingInstructions: text(direct?.["editing_instructions"]), title: text(brief["hook"]) || "Video production plan", version: Number(brief["version"] ?? render?.version ?? asset.version), duration: Number(brief["duration_s"]), size: text(brief["size"]), status: render?.status ?? "draft", phase: render?.phase ?? null, error: render?.error ?? null, script: text(brief["script"]), voiceover: text(brief["voiceover"]), audioMode: audioIsSilent ? "silent" : plan.steps.some((step) => step.role === "finished_video") ? "provider" : "composed", steps, beats: strings(brief["beats"]), direction: Object.entries(plan.direction ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => ({ label: label(key), value })), buildPlan: strings(report?.["approved_plan"]), reviewNotes: strings(report?.["review_notes"]), renderId: render?.id ?? null, snapshot: !!render, updatedAt: render?.updated_at ?? null };
}
