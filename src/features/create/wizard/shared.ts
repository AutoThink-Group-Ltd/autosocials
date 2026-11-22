import { cn } from "@/lib/utils";

export type Variant = {
  id: string; angle: string; hook: string; format: string; voiceover: string; caption: string; cta: string; script: string;
  version: number; position: number; planned_for: string | null; duration_s: number; size: string; review_state: string; primary_render_id?: string | null;
  review_note: string | null; beats: unknown; voice_id: string | null; batch_id: string; narrative: string; file_ids?: string[] | null; design_mode?: string | null;
  build_prompt?: string | null; build_prompt_issues?: unknown; build_report?: unknown; opening_visual?: string | null; production_plan?: unknown;
};
export type Job = { id: string; variant_id: string; status: string; phase?: string | null; error: string | null; storage_path: string | null; created_at: string; started_at?: string | null; progress?: number | null; frame_qa?: import("@/lib/frame-qa").FrameQa | null; technical_status?: string | null; creative_status?: string | null; qa_issues?: unknown };

export const btn = "inline-flex items-center justify-center gap-2 rounded-[10px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-40";
export const primary = cn(btn, "bg-ink text-inverse hover:bg-ink-hover");
export const ghost = cn(btn, "border border-border-control bg-surface hover:bg-surface-subtle");
export const field = "w-full rounded-[10px] border border-border-control bg-canvas px-2.5 py-2 text-[13px] focus-visible:border-ink focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ink/10";

export const beatsOf = (v: Variant) => (Array.isArray(v.beats) ? (v.beats as string[]) : []);
export const fmtDay = (d: string | null) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "Unplanned";
export const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
