import { z } from "zod";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import higgsfieldCatalogue from "./higgsfield-catalog.generated.json";

export type CreativeProviderId = "higgsfield" | "golpo" | "autotoast" | "tavus" | "heygen" | "kie";
const mediaUrl = z.string().url().max(2083).refine((value) => {
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.port && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname) && !u.hostname.includes(":") && u.hostname.includes(".");
}, "Use a publicly accessible HTTPS media URL");
const prompt = z.string().trim().min(1).max(5000);
const ratios = z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);
const video = { duration: z.number().int().min(4).max(15).default(5), resolution: z.enum(["480p", "720p", "1080p", "4k"]).default("720p"), generate_audio: z.boolean().default(true) };
const refs = { image_urls: z.array(mediaUrl).min(1).max(30).optional(), video_urls: z.array(mediaUrl).min(1).max(10).optional(), audio_urls: z.array(mediaUrl).min(1).max(10).optional() };
const refControls = { ...refs, resolution: z.enum(["480p", "720p", "1080p"]).default("720p"), bitrate_mode: z.enum(["standard", "high"]).default("high"), generate_audio: z.boolean().default(true) };
const image = { prompt, resolution: z.enum(["1k", "2k", "4k"]).default("2k"), aspect_ratio: z.enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"]).default("1:1"), quality: z.enum(["low", "medium", "high"]).default("high"), enhance_prompt: z.literal(false).default(false) };
const genjutsu = { prompt: z.string().max(10000).default(""), video_url: mediaUrl, resolution: z.enum(["480p", "720p", "1080p"]).default("720p") };
const ltxFast = { prompt: z.string().trim().min(2).max(5000), duration: z.union([z.literal(6), z.literal(8), z.literal(10)]).default(6), fps: z.union([z.literal(24), z.literal(25), z.literal(48), z.literal(50)]).default(25), resolution: z.enum(["720p", "1080p", "2k", "4k"]).default("720p"), aspect_ratio: z.enum(["16:9", "9:16"]).default("16:9"), generate_audio: z.boolean().default(true), camera_movement: z.enum(["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"]).optional() };
const klingShots = { prompt: z.string().trim().min(1).max(2500), duration: z.number().int().min(3).max(15).default(5), multi_shots: z.boolean().default(false), multi_prompt: z.array(z.object({ prompt: z.string().trim().min(1).max(512), duration: z.number().int().min(1).max(15) }).strict()).min(1).max(6).optional() };
function refineKling(v: { multi_shots: boolean; multi_prompt?: unknown[] | undefined }, ctx: z.RefinementCtx) {
  if (v.multi_prompt && !v.multi_shots) ctx.addIssue({ code: "custom", path: ["multi_shots"], message: "Enable multiple shots when supplying custom shot prompts" });
}
const canvasStyles = ["chalkboard_bw", "chalkboard_black_on_white", "chalkboard_color", "whiteboard", "modern_minimal", "playful", "technical", "editorial", "sharpie", "illustrations"];
export const GOLPO_CANVAS_STYLES = [...canvasStyles.flatMap((s) => [s, `${s}_compact`]), "notebook_infographic"];
export const GOLPO_SKETCH_STYLES = ["classic", "improved(beta)", "formal", "crayon", "dry_erase", "professional_clean", "creative", "infographics", "chalkboard_black_on_white"] as const;
// Reuse the vocabulary mapping exercised by AutoScribble's REST v2 adapter.
const golpoLanguages = ["english", "spanish", "french", "german", "italian", "portuguese", "dutch", "arabic", "hindi", "urdu", "chinese", "japanese", "polish", "turkish"] as const;
const languageNames: Record<string, typeof golpoLanguages[number]> = { en: "english", "en-gb": "english", es: "spanish", fr: "french", de: "german", it: "italian", pt: "portuguese", nl: "dutch", ar: "arabic", hi: "hindi", ur: "urdu", zh: "chinese", ja: "japanese", pl: "polish", tr: "turkish" };
const golpoLanguage = z.preprocess((value) => typeof value === "string" ? languageNames[value.trim().toLowerCase()] ?? value.trim().toLowerCase() : value, z.enum(golpoLanguages));
const golpo = z.object({
  prompt, custom_script: z.string().trim().min(1).max(15000).optional(), timing: z.enum(["0.25", "0.5", "1", "2", "4", "8", "10", "15", "auto"]).default("0.5"), video_orientation: z.enum(["horizontal", "vertical"]).default("vertical"),
  narration_voice: z.enum(["female-1", "female-2", "male-1", "male-2"]).default("female-1"), narration_instructions: z.string().max(2000).optional(), narration_language: golpoLanguage.default("english"),
  background_track: z.enum(["jazz", "lofi", "dramatic", "engaging", "hyper", "inspirational", "documentary"]).optional(), visual_instructions: z.string().max(5000).optional(), enable_color: z.boolean().default(true), scene_pacing: z.enum(["normal", "fast"]).default("normal"),
  own_narration_source: mediaUrl.optional(), reference_source: z.array(mediaUrl).max(10).optional(),
  custom_images: z.array(mediaUrl).min(1).max(10).optional(), custom_images_description: z.array(z.string().min(1).max(1000)).max(10).optional(), keep_original_images: z.array(z.boolean()).max(10).optional(), disable_image_animation: z.array(z.boolean()).max(10).optional(),
  custom_videos: z.array(mediaUrl).min(1).max(10).optional(), custom_videos_description: z.array(z.string().min(1).max(1000)).max(10).optional(), use_ai_audio_at: z.array(z.number().int().min(1).max(10)).max(10).optional(),
  custom_logo: mediaUrl.optional(), logo_position: z.enum(["tl", "tr", "bl", "br"]).optional(), onscreen_text_from_script_only: z.boolean().default(false), visibility: z.literal("private").default("private"), watermark: z.literal(false).default(false),
}).strict();
function refineGolpo(v: z.infer<typeof golpo>, ctx: z.RefinementCtx) {
  for (const kind of ["images", "videos"] as const) {
    const items = v[`custom_${kind}`], descriptions = v[`custom_${kind}_description`];
    if (Boolean(items) !== Boolean(descriptions) || (items && items.length !== descriptions?.length)) ctx.addIssue({ code: "custom", path: [`custom_${kind}_description`], message: "Provide one description per supplied media item" });
  }
  for (const k of ["keep_original_images", "disable_image_animation"] as const) if (v[k] && (!v.custom_images || v[k]!.length > v.custom_images.length)) ctx.addIssue({ code: "custom", path: [k], message: "Image controls require matching images" });
  if (v.use_ai_audio_at && (v.use_ai_audio_at.length > (v.custom_videos?.length ?? 0) || new Set(v.use_ai_audio_at).size !== v.use_ai_audio_at.length || v.use_ai_audio_at.some((n) => !v.custom_videos || n > v.custom_videos.length))) ctx.addIssue({ code: "custom", path: ["use_ai_audio_at"], message: "Choose each supplied video position at most once" });
  if (v.logo_position && !v.custom_logo) ctx.addIssue({ code: "custom", path: ["logo_position"], message: "Logo placement requires a custom logo" });
  if (v.custom_script && v.own_narration_source) ctx.addIssue({ code: "custom", path: ["custom_script"], message: "Choose supplied script or own narration" });
}
const schemas = {
  "kie-nano-image": z.object({ prompt: prompt.max(20000), aspect_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]).default("1:1"), resolution: z.enum(["1K", "2K", "4K"]).default("1K"), output_format: z.enum(["png", "jpg"]).default("png") }).strict(),
  "kie-nano-image-edit": z.object({ prompt: prompt.max(20000), image_input: z.array(mediaUrl).min(1).max(10), aspect_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]).default("1:1"), resolution: z.enum(["1K", "2K", "4K"]).default("1K"), output_format: z.enum(["png", "jpg"]).default("png") }).strict(),
  "kie-veo-text-video": z.object({ prompt, model: z.enum(["veo3_lite", "veo3_fast"]).default("veo3_fast"), generation_type: z.literal("TEXT_2_VIDEO").default("TEXT_2_VIDEO"), duration: z.literal(8).default(8), aspect_ratio: z.enum(["9:16", "16:9"]).default("9:16"), resolution: z.enum(["720p", "1080p", "4k"]).default("720p") }).strict(),
  "kie-veo-image-video": z.object({ prompt, model: z.enum(["veo3_lite", "veo3_fast"]).default("veo3_fast"), generation_type: z.literal("FIRST_AND_LAST_FRAMES_2_VIDEO").default("FIRST_AND_LAST_FRAMES_2_VIDEO"), image_urls: z.array(mediaUrl).min(1).max(2), duration: z.literal(8).default(8), aspect_ratio: z.enum(["9:16", "16:9"]).default("9:16"), resolution: z.enum(["720p", "1080p", "4k"]).default("720p") }).strict(),
  "kie-veo-reference-video": z.object({ prompt, model: z.enum(["veo3_lite", "veo3_fast"]).default("veo3_fast"), generation_type: z.literal("REFERENCE_2_VIDEO").default("REFERENCE_2_VIDEO"), image_urls: z.array(mediaUrl).min(1).max(3), duration: z.literal(8).default(8), aspect_ratio: z.enum(["9:16", "16:9"]).default("9:16"), resolution: z.enum(["720p", "1080p", "4k"]).default("720p") }).strict(),
  // Audio is a short-lived URL resolved only by the trusted production queue; it is never a planning input.
  "heygen-avatar": z.object({ avatar_id: z.literal("Daphne_public_4").default("Daphne_public_4"), audio_url: mediaUrl.optional(), duration: z.number().positive().max(60), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).default("9:16") }).strict(),
  "higgsfield-seedance-text-video": z.object({ prompt, ...video, aspect_ratio: ratios.default("9:16") }).strict(),
  "higgsfield-seedance-image-video": z.object({ prompt: prompt.optional(), image_url: mediaUrl, end_image_url: mediaUrl.optional(), ...video }).strict(),
  "higgsfield-seedance-reference-video": z.object({ prompt: prompt.optional(), ...refControls, duration: z.number().int().min(4).max(30).default(5), aspect_ratio: ratios.default("9:16") }).strict().refine((v) => Boolean(v.image_urls?.length || v.video_urls?.length || v.audio_urls?.length), "Supply at least one reference"),
  "higgsfield-seedance-video-edit": z.object({ prompt, video_url: mediaUrl, ...refControls }).strict().refine((v) => (v.video_urls?.length ?? 0) <= 9, "Source plus references must total at most ten videos").refine((v) => 1 + (v.image_urls?.length ?? 0) + (v.video_urls?.length ?? 0) + (v.audio_urls?.length ?? 0) <= 50, "At most fifty media items including source"),
  "higgsfield-seedance-video-extend": z.object({ prompt, video_url: mediaUrl, ...refControls, duration: z.number().int().min(4).max(30).default(5) }).strict().refine((v) => (v.video_urls?.length ?? 0) <= 9, "Source plus references must total at most ten videos").refine((v) => 1 + (v.image_urls?.length ?? 0) + (v.video_urls?.length ?? 0) + (v.audio_urls?.length ?? 0) <= 50, "At most fifty media items including source"),
  "higgsfield-ltx-fast-text-video": z.object(ltxFast).strict(),
  "higgsfield-ltx-fast-image-video": z.object({ ...ltxFast, image_url: mediaUrl, end_image_url: mediaUrl.optional() }).strict(),
  "higgsfield-kling3-image-video": z.object({ ...klingShots, image_url: mediaUrl, last_image_url: mediaUrl.optional(), sound: z.enum(["on", "off"]).default("on"), cfg_scale: z.number().min(0).max(1).multipleOf(0.01).default(0.5), elements: z.array(z.string().regex(/^\d+$/)).max(20).optional() }).strict().superRefine(refineKling),
  "higgsfield-kling-o3-keyframes": z.object({ ...klingShots, first_frame_url: mediaUrl, last_frame_url: mediaUrl.optional(), mode: z.enum(["std", "pro", "4k"]).default("pro"), sound: z.enum(["on", "off"]).default("off"), aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional() }).strict().superRefine((v, ctx) => { refineKling(v, ctx); if (v.multi_shots && !v.multi_prompt?.length) ctx.addIssue({ code: "custom", path: ["multi_prompt"], message: "Provide custom shots for O3 multiple-shot mode" }); }),
  "higgsfield-wan-reference-video": z.object({ prompt, duration: z.number().int().min(2).max(30).default(5), resolution: z.enum(["480p", "720p", "1080p"]).default("1080p"), aspect_ratio: z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]).default("adaptive"), generate_audio: z.boolean().default(true), enable_thinking: z.boolean().default(false), seed: z.number().int().min(0).max(2147483647).optional(), image_urls: z.array(mediaUrl).max(10).optional(), video_urls: z.array(mediaUrl).max(5).optional(), audio_urls: z.array(mediaUrl).max(5).optional(), file_url: mediaUrl.optional(), link_url: mediaUrl.optional() }).strict().refine((v) => !(v.file_url && v.link_url), "Choose a document or a webpage reference").transform((v) => ({ ...v, ...(v.file_url || v.link_url ? { enable_thinking: true } : {}) })),
  "higgsfield-image-generate": z.object(image).strict(), "higgsfield-image-edit": z.object({ ...image, image_urls: z.array(mediaUrl).min(1).max(16) }).strict(),
  "higgsfield-image-preset": z.object({ ...image, enhance_prompt: z.literal(true).default(true), quality: z.literal("high").default("high"), preset_id: z.string().uuid(), image_urls: z.array(mediaUrl).min(1).max(2) }).strict(),
  "higgsfield-genjutsu-restyle": z.object({ ...genjutsu, preset_id: z.string().uuid(), image_urls: z.array(mediaUrl).max(5).default([]) }).strict(),
  "higgsfield-genjutsu-motion-transfer": z.object({ ...genjutsu, image_urls: z.array(mediaUrl).min(1).max(8) }).strict(),
  "higgsfield-genjutsu-object-swap": z.object({ ...genjutsu, image_urls: z.array(mediaUrl).min(1).max(8) }).strict(),
  "golpo-canvas": golpo.extend({ golpo_video_engine: z.literal("golpo_canvas").default("golpo_canvas"), canvas_style_variant: z.string().refine((v) => GOLPO_CANVAS_STYLES.includes(v), "Unknown Canvas style").default("modern_minimal"), pen_animation_style: z.enum(["stylus", "marker", "pen"]).optional(), visual_animation_style: z.enum(["auto", "fade_in", "sketch"]).default("auto"), onscreen_text_language: golpoLanguage.optional() }).superRefine(refineGolpo),
  "golpo-sketch": golpo.extend({ golpo_video_engine: z.literal("golpo_sketch").default("golpo_sketch"), sketch_style_variant: z.enum(GOLPO_SKETCH_STYLES).default("classic") }).superRefine(refineGolpo),
};
export type CreativeCapabilityId = keyof typeof schemas | `higgsfield-catalog-${string}` | "autotoast-hyperframes" | "tavus-presenter";
export const CREATIVE_CAPABILITY_REGISTRY_VERSION = 5;
export type CreativeSettings = Record<string, unknown>;
export type CreativeControl = { key: string; label: string; type: "text" | "url" | "number" | "boolean" | "select" | "array" | "object"; required: boolean; options?: Array<string | number | boolean>; default?: string | number | boolean; min?: number; max?: number; itemType?: string; notes?: string };
export type CreativeCapabilityVerification = { registryVersion: number; modelVersion: string; documented: boolean; implemented: boolean; contractCheckedAt: string | null; liveTestedAt: string | null; observedLatencyMs: { median: number; p95: number; samples: number } | null; costBasis: string };
export type CreativeCapability = { id: CreativeCapabilityId; provider: CreativeProviderId; label: string; output: "video" | "image"; status: "supported" | "unavailable"; operations: { submit: boolean; poll: boolean; cancel: boolean; estimate: boolean }; inputs: string[]; controls?: CreativeControl[]; notes: string[]; documentation: string; endpoint?: string; family?: string; verification?: CreativeCapabilityVerification; assetRoles?: Record<string, string>; audioBehaviour?: string };
const hfDocs: Record<string, string> = { "higgsfield-seedance-text-video": "seedance-2/text-to-video", "higgsfield-seedance-image-video": "seedance-2/image-to-video", "higgsfield-seedance-reference-video": "seedance-2-5/reference-to-video", "higgsfield-seedance-video-edit": "seedance-2-5/video-edit", "higgsfield-seedance-video-extend": "seedance-2-5/video-extend", "higgsfield-ltx-fast-text-video": "ltx-2-5/text-to-video-fast", "higgsfield-ltx-fast-image-video": "ltx-2-5/image-to-video-fast", "higgsfield-kling3-image-video": "kling-3/pro-image-to-video", "higgsfield-kling-o3-keyframes": "kling-o3/first-last-frame", "higgsfield-wan-reference-video": "wan-3-prime/reference-to-video", "higgsfield-image-generate": "marketing-studio-image/generate-and-edit", "higgsfield-image-edit": "marketing-studio-image/generate-and-edit" };
Object.assign(hfDocs, { "higgsfield-image-preset": "marketing-studio-image/generate-and-edit", "higgsfield-genjutsu-restyle": "genjutsu/restyle", "higgsfield-genjutsu-motion-transfer": "genjutsu/motion-transfer", "higgsfield-genjutsu-object-swap": "genjutsu/object-swap" });
const hfRoles: Partial<Record<keyof typeof schemas, Record<string, string>>> = {
  "higgsfield-image-preset": { image_urls: "ordered_product_then_optional_identity" },
  "higgsfield-genjutsu-restyle": { video_url: "source_footage", image_urls: "identity" },
  "higgsfield-genjutsu-motion-transfer": { video_url: "motion", image_urls: "identity" },
  "higgsfield-genjutsu-object-swap": { video_url: "source_footage", image_urls: "product" },
  "higgsfield-seedance-image-video": { image_url: "first_frame", end_image_url: "last_frame" },
  "higgsfield-seedance-reference-video": { image_urls: "image_reference", video_urls: "video_reference", audio_urls: "audio_reference" },
  "higgsfield-seedance-video-edit": { video_url: "source_footage", image_urls: "image_reference", video_urls: "video_reference", audio_urls: "audio_reference" },
  "higgsfield-seedance-video-extend": { video_url: "source_footage", image_urls: "image_reference", video_urls: "video_reference", audio_urls: "audio_reference" },
  "higgsfield-ltx-fast-image-video": { image_url: "first_frame", end_image_url: "last_frame" },
  "higgsfield-kling3-image-video": { image_url: "first_frame", last_image_url: "last_frame", elements: "account_owned_identity" },
  "higgsfield-kling-o3-keyframes": { first_frame_url: "first_frame", last_frame_url: "last_frame" },
  "higgsfield-wan-reference-video": { image_urls: "image_reference", video_urls: "video_reference", audio_urls: "audio_reference", file_url: "document_reference", link_url: "webpage_reference" },
};
function hf(id: keyof typeof schemas, label: string, endpoint: string, output: "video" | "image", inputs: string[], notes: string[] = []): CreativeCapability { return { id, provider: "higgsfield", label, output, status: "supported", operations: { submit: true, poll: true, cancel: true, estimate: true }, inputs, notes: ["Documented; account/model access and paid output remain unverified.", ...notes], documentation: `https://docs.higgsfield.ai/docs/models/${hfDocs[id]}.md`, endpoint,
  verification: { registryVersion: CREATIVE_CAPABILITY_REGISTRY_VERSION, modelVersion: endpoint, documented: true, implemented: true, contractCheckedAt: "2026-11-02", liveTestedAt: null, observedLatencyMs: null, costBasis: "Per-request USD estimate from the provider estimate endpoint; actual invoice cost unverified." },
  ...(hfRoles[id] ? { assetRoles: { ...hfRoles[id] } } : {}), audioBehaviour: output === "image" ? "No audio output." : "Native generated audio depends on generate_audio or sound; compositor scenes must be muted explicitly." }; }
const capabilities: CreativeCapability[] = [
  ...(["kie-nano-image", "kie-nano-image-edit", "kie-veo-text-video", "kie-veo-image-video", "kie-veo-reference-video"] as const).map((id): CreativeCapability => {
    const image = id.startsWith("kie-nano"), edit = id === "kie-nano-image-edit";
    return { id, provider: "kie", family: image ? "Nano Banana 2" : "Veo 3.1", label: image ? `Kie Nano Banana 2 · ${edit ? "Edit image" : "Generate image"}` : `Kie Veo 3.1 · ${id.includes("reference") ? "Reference video" : id.includes("image") ? "Animate keyframes" : "Text to video"}`, output: image ? "image" : "video", status: "supported", operations: { submit: true, poll: true, cancel: false, estimate: true }, endpoint: "api/v1/jobs/createTask", inputs: ["prompt", ...(edit ? ["image_input"] : !image && !id.includes("text") ? ["image_urls"] : [])], documentation: image ? "https://docs.kie.ai/market/google/nanobanana2" : "https://docs.kie.ai/veo3-api/generate-veo-3-video", notes: ["Documented integration; credentials, account access and paid outputs remain unverified.", "No documented native idempotency or cancellation. Ambiguous submissions require reconciliation; never resubmit automatically.", "Copy outputs into private workspace storage before the provider's 14-day retention expires.", ...(image ? ["One image per operation. Reference images must be JPEG, PNG or WebP, each at most 30 MB."] : ["Initial integration: 8-second scenes, Lite/Fast tiers. Assemble longer films with HyperFrames; no native narrator selection."])], audioBehaviour: image ? "No audio output." : "Native background audio; compositor scenes are muted and use the approved narration.", verification: { registryVersion: CREATIVE_CAPABILITY_REGISTRY_VERSION, modelVersion: image ? "nano-banana-2" : "veo-3-1", documented: true, implemented: true, contractCheckedAt: "2026-11-18", liveTestedAt: null, observedLatencyMs: null, costBasis: "Published USD reference rates checked 18 November 2026, not a live quote. Actual consumed provider credits recorded when reported." } };
  }),
  { id: "heygen-avatar", provider: "heygen", label: "HeyGen Avatar III · Reaction presenter", output: "video", status: "supported", operations: { submit: true, poll: true, cancel: false, estimate: true }, inputs: ["audio_url", "avatar_id", "duration", "aspect_ratio"], notes: ["Generates a presenter from the exact approved narration audio, which must also be used by the final composition.", "The approved film duration is the maximum billed duration for the preflight estimate. Runtime must verify the narration is no longer than that duration.", "Ambiguous submission must be reconciled; never silently create a second paid job."], documentation: "https://developers.heygen.com/audio-to-video", endpoint: "v3/videos", audioBehaviour: "The avatar is lip-synced to the supplied narration; the compositor must play the same narration on the same timeline." },
  { ...hf("higgsfield-genjutsu-restyle", "Genjutsu 1.0 · Restyle footage", "higgsfield/genjutsu/restyle/v1.0", "video", ["video_url", "preset_id", "image_urls?"], ["Fetch current presets before selection. Source 4–30 seconds, maximum 200 MiB; character images at most 64 MiB each. Source audio retained. Output cadence and duration may vary: use as scene input with verified assembly."]), audioBehaviour: "Retains source audio; no soundtrack control. Composited scenes are muted." },
  { ...hf("higgsfield-genjutsu-motion-transfer", "Genjutsu 1.0 · Transfer motion", "higgsfield/genjutsu/motion-transfer/v1.0", "video", ["video_url", "image_urls"], ["Source 4–30 seconds; 1–8 appearance images. Source drives motion and prepared duration. Audio behavior is not specified in the model contract."]), audioBehaviour: "Unspecified by model documentation; do not promise generated audio. Composited scenes are muted." },
  { ...hf("higgsfield-genjutsu-object-swap", "Genjutsu 1.0 · Replace objects", "higgsfield/genjutsu/object-swap/v1.0", "video", ["video_url", "image_urls"], ["Source 4–30 seconds and at least 409,600 pixels per frame; 1–8 replacement images. Audio behavior is not specified in the model contract."]), audioBehaviour: "Unspecified by model documentation; do not promise generated audio. Composited scenes are muted." },
  hf("higgsfield-image-preset", "Marketing Studio 2.0 Alpha · Product preset", "marketing-studio/image", "image", ["prompt", "preset_id", "image_urls"], ["Fetch current authenticated presets; high quality only. Product image first, optional person reference second; enhancement uses the selected preset. No invented preset IDs."]),
  hf("higgsfield-seedance-text-video", "Seedance 2.0 · Text to video", "bytedance/seedance-2.0/text-to-video", "video", ["prompt"], ["4–15 seconds; native audio optional."]),
  hf("higgsfield-seedance-image-video", "Seedance 2.0 · Image to video", "bytedance/seedance-2.0/image-to-video", "video", ["image_url", "prompt?", "end_image_url?"], ["Framing follows supplied image."]),
  hf("higgsfield-seedance-reference-video", "Seedance 2.5 · Reference video", "bytedance/seedance-2.5/reference-to-video", "video", ["image_urls?", "video_urls?", "audio_urls?"], ["4–30 seconds; video and audio reference totals each have a 30-second budget."]),
  hf("higgsfield-seedance-video-edit", "Seedance 2.5 · Edit video", "bytedance/seedance-2.5/video-edit", "video", ["prompt", "video_url"], ["Source determines duration and framing; normalized to at least four seconds within a 30-second budget."]),
  hf("higgsfield-seedance-video-extend", "Seedance 2.5 · Extend video", "bytedance/seedance-2.5/video-extend", "video", ["prompt", "video_url", "image_urls?", "video_urls?", "audio_urls?"], ["4–30 seconds; source controls framing. Source plus video references share ten items and a 30-second preprocessing budget; audio has a separate 30-second budget."]),
  hf("higgsfield-ltx-fast-text-video", "LTX 2.5 Fast · Camera-led scene", "lightricks/ltx-2.5/text-to-video/fast", "video", ["prompt"], ["6, 8 or 10-second clips; explicit camera movement, FPS and resolution controls. Fast is the model name; end-to-end latency is unmeasured."]),
  hf("higgsfield-ltx-fast-image-video", "LTX 2.5 Fast · Animate keyframes", "lightricks/ltx-2.5/image-to-video/fast", "video", ["prompt", "image_url", "end_image_url?"], ["6, 8 or 10 seconds. First and optional last frame; explicit output aspect ratio."]),
  hf("higgsfield-kling3-image-video", "Kling 3 Pro · Keyframes and shots", "kling-video/v3.0/pro/image-to-video", "video", ["prompt", "image_url", "last_image_url?"], ["Single-shot 3–15 seconds. Custom shot durations are summed and override top-level duration; each of 1–6 shots is 1–15 seconds. Elements require account-owned decimal IDs; integration caps the list at twenty."]),
  hf("higgsfield-kling-o3-keyframes", "Kling O3 · First and last frame", "kling-video/o3/first-last-frame", "video", ["prompt", "first_frame_url", "last_frame_url?"], ["Uses first_frame_url/last_frame_url, unlike Kling 3. Custom shots require multi_shots and their duration sum controls generation and billing."]),
  hf("higgsfield-wan-reference-video", "Wan 3 Prime · Multimodal references", "alibaba/wan-3.0-prime/reference-to-video", "video", ["prompt", "image_urls?", "video_urls?", "audio_urls?", "file_url?", "link_url?"], ["2–30 seconds. Video references: each 1–30 seconds, total 30 seconds. WAV/MP3 audio references total 30 seconds. Document or public webpage forces thinking; choose only one. Supported documents: docx/xlsx/pptx/pdf/md. Seed zero is accepted but provider runtime forwards only nonzero seeds."]),
  hf("higgsfield-image-generate", "Higgsfield Marketing Studio · Image", "marketing-studio/image", "image", ["prompt"]), hf("higgsfield-image-edit", "Higgsfield Marketing Studio · Edit image", "marketing-studio/image", "image", ["prompt", "image_urls"]),
  ...(["canvas", "sketch"] as const).map((engine): CreativeCapability => ({ id: `golpo-${engine}`, provider: "golpo", label: `Golpo ${engine === "canvas" ? "Canvas" : "Sketch"} · Explainer`, output: "video", status: "supported", operations: { submit: true, poll: true, cancel: false, estimate: false }, inputs: ["prompt", "custom_script?", "own_narration_source?", "custom_images?", "custom_videos?"], notes: ["Documented; account access and paid outputs remain unverified.", "No documented cancellation or native idempotency; ambiguous submission requires reconciliation.", "Private outputs; duration in minutes. Fifteen minutes requires eligible plan.", "Published base rate $2/min; account entitlements apply.", "Integration limits: ten media items per array; custom scripts 15,000 characters."], documentation: "https://video.golpoai.com/api-docs/endpoints/v2", endpoint: "api/v2/videos/generate" })),
  { id: "autotoast-hyperframes", provider: "autotoast", label: "HyperFrames", output: "video", status: "supported", operations: { submit: true, poll: true, cancel: false, estimate: false }, inputs: ["html", "size", "audioUrl", "durationSeconds", "files?"], notes: ["Existing render.server.ts owns POST /v1/render-jobs with Bearer secret and Idempotency-Key; GET /v1/render-jobs/{id}.", "Retain existing composition, captions, media and rendering pipeline."], documentation: "src/lib/render.server.ts" },
  { id: "tavus-presenter", provider: "tavus", label: "Tavus · Presenter (not connected)", output: "video", status: "unavailable", operations: { submit: false, poll: false, cancel: false, estimate: false }, inputs: ["replica_id", "script or audio_url"], notes: ["Fit: stock or consented personal talking-head presenters; not general scene generation.", "Future dedicated presenter workflow; no adapter or credential integration."], documentation: "https://docs.tavus.io/api-reference/video-request/create-video" },
];
type CatalogueField = { [key: string]: unknown; anyOf?: CatalogueField[]; type?: string; format?: string; enum?: unknown[]; title?: string; description?: string; default?: unknown; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number; items?: CatalogueField };
type HiggsfieldCatalogueEntry = { kind: "video" | "image" | "training"; family: string; name: string; slug: string; endpoint: string; documentation: string; schema: { required?: string[]; properties?: Record<string, CatalogueField>; [key: string]: unknown }; notes: string[] };
const documentedHiggsfield = higgsfieldCatalogue as HiggsfieldCatalogueEntry[];
const existingHiggsfieldEndpoints = new Set(capabilities.filter((c) => c.provider === "higgsfield").map((c) => c.endpoint));
const addedHiggsfield = documentedHiggsfield.filter((entry) => entry.kind !== "training" && !existingHiggsfieldEndpoints.has(entry.endpoint));
export const higgsfieldCatalogueId = (slug: string) => `higgsfield-catalog-${slug.replaceAll("/", "-")}` as const;
for (const entry of addedHiggsfield) {
  capabilities.push({
    id: higgsfieldCatalogueId(entry.slug), provider: "higgsfield", label: entry.name, family: entry.family, output: entry.kind === "video" ? "video" : "image",
    status: "supported", operations: { submit: true, poll: true, cancel: true, estimate: true }, endpoint: entry.endpoint,
    inputs: Object.keys(entry.schema.properties ?? {}), documentation: entry.documentation,
    notes: ["Documented endpoint and request schema; account access and paid output have not been verified.", ...entry.notes],
    ...(entry.slug.includes("motion-control") ? { assetRoles: { image_url: "identity", video_url: "motion" } } : {}),
    verification: { registryVersion: CREATIVE_CAPABILITY_REGISTRY_VERSION, modelVersion: entry.endpoint, documented: true, implemented: true, contractCheckedAt: "2026-11-03", liveTestedAt: null, observedLatencyMs: null, costBasis: "Provider estimate is checked before submission; actual invoice cost unverified." },
    audioBehaviour: entry.kind === "image" ? "No audio output." : "Native audio depends on the documented workflow; compositor scenes are muted.",
  });
}
const addedHiggsfieldById = new Map<string, HiggsfieldCatalogueEntry>(addedHiggsfield.map((entry) => [higgsfieldCatalogueId(entry.slug), entry]));
const catalogValidator = addFormats(new Ajv({ strict: false, allErrors: true, useDefaults: true }));
const catalogChecks = new Map<string, ReturnType<typeof catalogValidator.compile>>();
function catalogControls(entry: HiggsfieldCatalogueEntry): CreativeControl[] {
  return Object.entries(entry.schema.properties ?? {}).map(([key, spec]) => {
    const variants = Array.isArray(spec.anyOf) ? spec.anyOf : [];
    const field = variants.find((part) => part.type !== "null") ?? spec;
    const type = field.type === "integer" || field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : field.type === "array" ? "array" : field.type === "object" ? "object" : field.format === "uri" ? "url" : Array.isArray(field.enum) ? "select" : "text";
    const control: CreativeControl = { key, label: String(spec.title ?? key.replaceAll("_", " ")), type, required: entry.schema.required?.includes(key) ?? false };
    if (Array.isArray(field.enum)) control.options = field.enum.filter((value): value is string | number | boolean => ["string", "number", "boolean"].includes(typeof value));
    if (["string", "number", "boolean"].includes(typeof spec.default)) control.default = spec.default as string | number | boolean;
    if (typeof field.minimum === "number") control.min = field.minimum;
    if (typeof field.maximum === "number") control.max = field.maximum;
    if (typeof field.minLength === "number") control.min = field.minLength;
    if (typeof field.maxLength === "number") control.max = field.maxLength;
    if (typeof field.minItems === "number") control.min = field.minItems;
    if (typeof field.maxItems === "number") control.max = field.maxItems;
    if (type === "array") control.itemType = String(field.items?.type ?? "text");
    if (typeof spec.description === "string") control.notes = spec.description.slice(0, 500);
    if (key === "batch_size" && entry.kind === "image") { control.options = [1]; control.notes = "One image per production step; additional paid outputs are not stored."; }
    return control;
  });
}
/** Derive the public control contract from the same Zod schema used before submission. */
function controlsFor(id: CreativeCapabilityId): CreativeControl[] {
  const catalogue = addedHiggsfieldById.get(id);
  if (catalogue) return catalogControls(catalogue);
  if (!(id in schemas)) {
    if (id === "tavus-presenter") return [];
    return [{ key: "html", label: "Composition HTML", type: "text", required: true }, { key: "size", label: "Output size", type: "text", required: true }, { key: "audioUrl", label: "Narration audio", type: "url", required: true }, { key: "durationSeconds", label: "Duration (seconds)", type: "number", required: true }, { key: "files", label: "Composition files", type: "object", required: false }];
  }
  let object: z.ZodTypeAny = schemas[id as keyof typeof schemas];
  while (object instanceof z.ZodEffects) object = object.innerType();
  if (!(object instanceof z.ZodObject)) return [];
  const shape: Record<string, z.ZodTypeAny> = object.shape;
  return Object.entries(shape).map(([key, schema]) => {
    const control: CreativeControl = { key, label: key.replace(/_/g, " "), type: "text", required: !schema.isOptional() };
    let value = schema;
    while (value instanceof z.ZodDefault || value instanceof z.ZodOptional || value instanceof z.ZodEffects) {
      if (value instanceof z.ZodDefault) { const d: unknown = value._def.defaultValue(); if (["string", "number", "boolean"].includes(typeof d)) control.default = d as string | number | boolean; value = value.removeDefault(); }
      else if (value instanceof z.ZodOptional) value = value.unwrap();
      else if (value instanceof z.ZodEffects) value = value.innerType();
    }
    if (value instanceof z.ZodEnum) { control.type = "select"; control.options = [...value.options] as string[]; }
    else if (value instanceof z.ZodUnion && value.options.every((option: z.ZodTypeAny) => option instanceof z.ZodLiteral)) { control.type = "select"; control.options = value.options.map((option: z.ZodLiteral<string | number | boolean>) => option.value); }
    else if (value instanceof z.ZodLiteral) { control.type = "select"; control.options = [value.value]; }
    else if (value instanceof z.ZodNumber) { control.type = "number"; if (value.minValue !== null) control.min = value.minValue; if (value.maxValue !== null) control.max = value.maxValue; }
    else if (value instanceof z.ZodBoolean) control.type = "boolean";
    else if (value instanceof z.ZodString) { control.type = value.isURL ? "url" : "text"; if (value.minLength !== null) control.min = value.minLength; if (value.maxLength !== null) control.max = value.maxLength; }
    else if (value instanceof z.ZodArray) { control.type = "array"; if (value._def.minLength) control.min = value._def.minLength.value; if (value._def.maxLength) control.max = value._def.maxLength.value; const item = value.element; control.itemType = item instanceof z.ZodBoolean ? "boolean" : item instanceof z.ZodNumber ? "number" : item instanceof z.ZodObject ? "object" : "text"; }
    if (key === "canvas_style_variant") { control.type = "select"; control.options = [...GOLPO_CANVAS_STYLES]; }
    if (key === "timing") control.notes = "Minutes; 15 minutes requires an eligible provider plan. Auto duration is determined by the provider.";
    if (key === "custom_images_description" || key === "custom_videos_description") control.notes = "Required when the matching media array is supplied, with one description per item.";
    if (key === "video_urls" && id === "higgsfield-seedance-video-edit") { control.max = 9; control.notes = "Source video counts toward the ten-video limit; at most fifty total media items."; }
    if (key === "image_urls" || key === "video_urls" || key === "audio_urls") control.notes ??= "Public HTTPS media URLs; reference video/audio preprocessing each has a 30-second total budget where applicable.";
    if (key === "use_ai_audio_at") control.notes = "One-indexed positions of supplied videos whose audio is replaced by narration.";
    if (key === "logo_position") control.notes = "Requires a custom logo.";
    if (key === "multi_prompt") control.notes = "Each shot has prompt and duration; the sum overrides top-level duration for generation and billing.";
    if (key === "file_url" && id === "higgsfield-wan-reference-video") control.notes = "One docx/xlsx/pptx/pdf/md reference. Cannot combine with link_url; forces thinking.";
    if (key === "link_url" && id === "higgsfield-wan-reference-video") control.notes = "One public webpage. Cannot combine with file_url; forces thinking.";
    return control;
  });
}
export function listCreativeCapabilities(): CreativeCapability[] { return capabilities.map((c) => ({ ...c, inputs: [...c.inputs], controls: controlsFor(c.id), notes: [...c.notes], operations: { ...c.operations }, ...(c.assetRoles ? { assetRoles: { ...c.assetRoles } } : {}), verification: { ...(c.verification ?? { registryVersion: CREATIVE_CAPABILITY_REGISTRY_VERSION, modelVersion: c.endpoint ?? c.id, documented: true, implemented: c.status === "supported", contractCheckedAt: c.status === "supported" ? "2026-11-01" : null, liveTestedAt: null, observedLatencyMs: null, costBasis: c.provider === "golpo" ? "Published base rate USD 2/minute; account entitlements and actual invoice costs unverified." : "Provider account billing; actual invoice costs unverified." }) } })); }
export function getCreativeCapability(id: string): CreativeCapability { const c = capabilities.find((v) => v.id === id); if (!c) throw new Error("Unknown creative capability"); return { ...c, inputs: [...c.inputs], controls: controlsFor(c.id), notes: [...c.notes], operations: { ...c.operations }, ...(c.verification ? { verification: { ...c.verification } } : {}) }; }
function validateCatalogueSettings(id: string, raw: unknown): CreativeSettings {
  const entry = addedHiggsfieldById.get(id);
  if (!entry || !raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Unknown Higgsfield workflow or settings.");
  const input = structuredClone(raw) as Record<string, unknown>;
  if (JSON.stringify(input).length > 50_000 || Object.keys(input).some((key) => !Object.hasOwn(entry.schema.properties ?? {}, key))) throw new Error("Unsupported Higgsfield setting.");
  // Ajv evaluates top-level if/then before useDefaults fills omitted discriminators.
  for (const [key, field] of Object.entries(entry.schema.properties ?? {})) {
    if (!Object.hasOwn(input, key) && Object.hasOwn(field, "default")) input[key] = structuredClone(field.default);
  }
  if (entry.kind === "image" && input["batch_size"] !== undefined && input["batch_size"] !== 1) throw new Error("This production route stores one image per step.");
  if (entry.family.startsWith("Kling")) {
    if ("prompt" in (entry.schema.properties ?? {}) && (!String(input["prompt"] ?? "").trim() || String(input["prompt"]).length > 2500)) throw new Error("Kling needs a nonempty top-level prompt.");
    const shots = input["multi_prompt"];
    if (shots !== undefined && (!Array.isArray(shots) || shots.length < 1 || shots.length > 6 || input["multi_shots"] !== true)) throw new Error("Kling custom shots require multi-shot mode and one to six shots.");
    if (Array.isArray(shots) && shots.some((shot) => !shot || typeof shot !== "object" || !String((shot as Record<string, unknown>)["prompt"] ?? "").trim() || String((shot as Record<string, unknown>)["prompt"]).length > 512 || !Number.isInteger((shot as Record<string, unknown>)["duration"]) || Number((shot as Record<string, unknown>)["duration"]) < 1 || Number((shot as Record<string, unknown>)["duration"]) > 15)) throw new Error("Kling shots need a prompt and a duration of one to fifteen seconds.");
  }
  let check = catalogChecks.get(id);
  if (!check) { check = catalogValidator.compile(entry.schema); catalogChecks.set(id, check); }
  if (!check(input)) throw new Error("Higgsfield settings do not match the documented workflow schema.");
  const verifyUrls = (value: unknown, key = "") => {
    if (typeof value === "string" && /(?:^|_)url$/.test(key)) mediaUrl.parse(value);
    else if (Array.isArray(value)) for (const item of value) verifyUrls(item, key.endsWith("urls") ? "url" : key);
    else if (value && typeof value === "object") for (const [childKey, childValue] of Object.entries(value)) verifyUrls(childValue, childKey);
  };
  verifyUrls(input);
  if (entry.endpoint.includes("text-to-video") && (!String(input["prompt"] ?? "").trim() || String(input["prompt"]).length > 5000)) throw new Error("A concise text prompt is required for this video workflow.");
  return input;
}
export function validateCreativeSettings(id: CreativeCapabilityId, settings: unknown): CreativeSettings {
  if (addedHiggsfieldById.has(id)) return validateCatalogueSettings(id, settings);
  if (!(id in schemas)) throw new Error("Capability uses the existing composition pipeline or is unavailable");
  return schemas[id as keyof typeof schemas].parse(settings) as CreativeSettings;
}
/** Kling custom shots override duration; consumers must budget and validate their sum. */
export function creativeSettingsDuration(settings: CreativeSettings): number | null {
  if (settings["multi_shots"] === true && Array.isArray(settings["multi_prompt"]) && settings["multi_prompt"].length) {
    const shots = settings["multi_prompt"] as Array<{ duration?: unknown }>;
    if (shots.every((shot) => typeof shot.duration === "number" && Number.isFinite(shot.duration))) return shots.reduce((sum, shot) => sum + Number(shot.duration), 0);
  }
  return typeof settings["duration"] === "number" && Number.isFinite(settings["duration"]) ? settings["duration"] : null;
}
/** Safe for traces: omit prompts, scripts, descriptions, arbitrary text and signed URLs. */
export function safeCreativeSettings(id: CreativeCapabilityId, settings: unknown): CreativeSettings {
  const parsed = validateCreativeSettings(id, settings), safe: CreativeSettings = {};
  const allowed = new Set(["model", "generation_type", "output_format", "duration", "resolution", "aspect_ratio", "generate_audio", "quality", "enhance_prompt", "timing", "video_orientation", "narration_voice", "background_track", "enable_color", "scene_pacing", "visibility", "watermark", "golpo_video_engine", "canvas_style_variant", "sketch_style_variant", "pen_animation_style", "visual_animation_style", "bitrate_mode", "onscreen_text_from_script_only", "fps", "camera_movement", "sound", "cfg_scale", "multi_shots", "mode", "enable_thinking", "seed"]);
  for (const [k, v] of Object.entries(parsed)) { if (allowed.has(k)) safe[k] = v; else if (Array.isArray(v)) safe[`${k}_count`] = v.length; else if (v !== undefined) safe[`has_${k}`] = true; }
  const duration = creativeSettingsDuration(parsed); if (duration !== null) safe["effective_duration"] = duration;
  return safe;
}
