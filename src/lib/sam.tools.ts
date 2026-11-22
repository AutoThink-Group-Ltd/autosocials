import { VIDEO_DURATIONS } from "./content-rules";

/** Sam's chat tools and whether each may act straight away. Browser-safe. */
export const SAM_TOOLS = {
  revise_content_campaign: { confirm: false, label: "Updating your content calendar" },
  recover_content_campaign: { confirm: false, label: "Completing your earlier content plan" },
  plan_content_campaign: { confirm: false, label: "Planning your content calendar" },
  prepare_social_tiles: { confirm: false, label: "Preparing your social tile brief" },
  prepare_direct_video: { confirm: false, label: "Mapping your photos and video settings" },
  search_files: { confirm: false, label: "Searching brand files" },
  read_file: { confirm: false, label: "Reading a file" },
  get_batch: { confirm: false, label: "Checking the current batch" },
  list_outreach: { confirm: false, label: "Checking outreach campaigns" },
  prepare_outreach: { confirm: false, label: "Preparing your outreach campaign" },
  open_outreach: { confirm: false, label: "Opening your campaign" },
  list_virlo_resources: { confirm: false, label: "Checking saved research" },
  research_virlo: { confirm: false, label: "Finding creators and posts" },
  search_virlo: { confirm: false, label: "Researching social content" },
  show_in_live_view: { confirm: false, label: "Showing it in Live View" },
  update_brief: { confirm: false, label: "Editing an asset brief" },
  request_approval: { confirm: true, label: "Asking for your go-ahead" },
} as const;
export type SamToolName = keyof typeof SAM_TOOLS;

/** Actions that must never run from chat; Sam may only raise an approval card for them. */
export const GATED_ACTIONS = ["render_variants", "schedule", "use_assets", "publish", "send", "share", "delete", "clear_narratives", "other"] as const;
export function isGatedAction(a: string): boolean {
  return (GATED_ACTIONS as readonly string[]).includes(a);
}

export type BriefPatch = { hook?: string; script?: string; caption?: string; cta?: string; voiceover?: string; duration_s?: number; file_ids?: string[] };

/** Validates a brief edit against batch rules. Approved assets are locked; files must belong to the business. */
export function checkBriefPatch(reviewState: string, patch: BriefPatch, ownFiles: Set<string>): { ok: true; patch: BriefPatch } | { ok: false; error: string } {
  if (reviewState === "approved") return { ok: false, error: "That asset is already approved. Ask the user to send it back for edits first." };
  const out: BriefPatch = {};
  for (const k of ["hook", "script", "caption", "cta", "voiceover"] as const) {
    const v = patch[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 4000);
  }
  if (patch.duration_s !== undefined) {
    if (!(VIDEO_DURATIONS as readonly number[]).includes(patch.duration_s)) return { ok: false, error: `Length must be ${VIDEO_DURATIONS.join(" or ")} seconds.` };
    out.duration_s = patch.duration_s;
  }
  if (patch.file_ids) {
    const bad = patch.file_ids.filter((id) => !ownFiles.has(id));
    if (bad.length) return { ok: false, error: "Some of those files aren't in this business's library." };
    out.file_ids = [...new Set(patch.file_ids)];
  }
  if (!Object.keys(out).length) return { ok: false, error: "Nothing to change." };
  return { ok: true, patch: out };
}

/** Keep one copy of each message id (first wins) so replies never show twice. */
export function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
