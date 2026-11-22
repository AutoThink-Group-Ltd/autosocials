/** Values deliberately contain no provider payloads, credentials or signed URLs. */
export const GENERATION_STATUSES = ["reserved", "submitted", "running", "completed", "failed", "reconciliation_required"] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];
export type ReviewStatus = "pending" | "passed" | "needs_review" | "unverified" | "failed";
export type CostKind = "known" | "estimate" | "unknown";
export type GenerationStep = {
  id: string; render_job_id: string; workspace_id: string; variant_id: string;
  user_id: string | null; initiator: "user" | "sam" | "legacy";
  step_key: string; parent_step_id: string | null; retry_of_step_id: string | null;
  provider: string; model: string; model_version: string | null; operation: string; brief_summary: string | null;
  settings: Record<string, string | number | boolean>; usage: Record<string, number>;
  status: GenerationStatus; provider_job_id: string | null; provider_request_id: string | null;
  cost_amount: number | null; cost_currency: string | null; cost_kind: CostKind;
  output_storage_path: string | null; error_code: string | null;
  technical_status: ReviewStatus; creative_status: ReviewStatus;
  approval_status: "pending" | "approved" | "rejected" | "unknown";
  created_at: string; updated_at: string; submitted_at: string | null; started_at: string | null; completed_at: string | null;
};

const SETTING_KEYS = new Set(["settings_source", "model", "generation_type", "output_format", "image_input_count", "width", "height", "duration", "seconds", "size", "aspect_ratio", "quality", "fps", "format", "resolution", "seed", "voice_id", "caption_mode", "image_count", "scene_count", "temperature", "max_output_tokens", "timing", "generate_audio", "video_orientation", "golpo_video_engine", "narration_voice", "scene_pacing", "style_variant", "image_style_variant", "video_style_variant", "animation_style_variant", "narration_style", "transition_style", "enhance_prompt", "background_track", "enable_color", "visibility", "watermark", "canvas_style_variant", "sketch_style_variant", "pen_animation_style", "visual_animation_style", "bitrate_mode", "onscreen_text_from_script_only", "onscreen_text_language"]);
for (const key of ["image_urls", "video_urls", "audio_urls", "custom_images", "custom_images_description", "keep_original_images", "disable_image_animation", "custom_videos", "custom_videos_description", "use_ai_audio_at", "reference_source"]) SETTING_KEYS.add(`${key}_count`);
for (const key of ["prompt", "custom_script", "narration_instructions", "narration_language", "visual_instructions", "own_narration_source", "custom_logo", "logo_position", "onscreen_text_language", "image_url", "end_image_url", "video_url"]) SETTING_KEYS.add(`has_${key}`);
export function sanitizeGenerationSettings(input: unknown): GenerationStep["settings"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => SETTING_KEYS.has(key) &&
    (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.length <= 100 && !/https?:|[?=&]|bearer|sk[-_]|eyJ/i.test(value)))));
}
export function sanitizeUsage(input: unknown): Record<string, number> {
  const keys = new Set(["input_tokens", "output_tokens", "total_tokens", "cached_tokens", "images", "seconds", "characters", "credits"]);
  return Object.fromEntries(Object.entries(input && typeof input === "object" ? input : {}).filter(([k,v]) => keys.has(k) && typeof v === "number" && Number.isFinite(v) && v >= 0));
}
export function safeStoragePath(input: string | null | undefined): string | null {
  if (!input || input.length > 1024 || /https?:|[?#\r\n]|\.\./i.test(input)) return null;
  return input;
}
export function formatGenerationCost(step: Pick<GenerationStep, "cost_amount" | "cost_currency" | "cost_kind">): string {
  if (step.cost_kind === "unknown" || step.cost_amount == null || !step.cost_currency) return "Unknown";
  return `${step.cost_kind === "estimate" ? "Estimated " : ""}${step.cost_currency} ${Number(step.cost_amount).toFixed(4)}`;
}
