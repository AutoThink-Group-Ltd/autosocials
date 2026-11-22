import { creativeSettingsDuration, getCreativeCapability, listCreativeCapabilities, validateCreativeSettings, type CreativeCapabilityId } from "./creative-providers/registry";

// The deployed creative_variants_duration_chk currently admits only these film lengths.
export const DIRECT_VIDEO_DURATIONS = [15, 30] as const;

export type DirectVideoBrief = { prompt: string; originalMessage: string; editingInstructions: string; voiceover: string; duration: number | null; aspectRatio: string | null; resolution: string | null; requestedModel: string | null };
export type DirectVideoOption = { capabilityId: CreativeCapabilityId; label: string; settings: Record<string, unknown> };
export type DirectVideoPreparation = { brief: DirectVideoBrief; referenceIds: string[]; options: DirectVideoOption[]; reason: string; missing: string[]; matchedCapabilityId: CreativeCapabilityId | null };

/** Only explicit values in the user's message are mapped. Uploaded document content is never passed here. */
export function parseDirectVideoBrief(message: string): DirectVideoBrief {
  const clean = message.replace(/\*\*/g, "");
  const quoted = clean.match(/[“"]((?:Create|Generate|Animate|Produce)\b[\s\S]*?)[”"]/i)?.[1];
  const voiceover = clean.match(/Voiceover\s*:\s*[“"]([^”"]+)[”"]/i)?.[1]?.trim() ?? "";
  const edit = clean.match(/(?:Add the logo|Add (?:the )?voiceover|(?:logo|voiceover).{0,30}in editing)[\s\S]*$/i)?.[0] ?? "";
  const duration = clean.match(/\b(\d{1,3})\s*(?:[-–]\s*)?(?:seconds?|secs?|s)\b/i)?.[1];
  const ratio = clean.match(/\b(9:16|16:9|1:1|4:5)\b/)?.[1] ?? null;
  const resolution = clean.match(/\b(480p|720p|1080p|4k)\b/i)?.[1]?.toLowerCase() ?? null;
  const model = clean.match(/\b(Kling\s+(?:Omni|O3|\d+(?:\.\d+)?(?:\s+Turbo)?)|Seedance\s+\d+(?:\.\d+)?|Wan\s+\d+(?:\.\d+)?(?:\s+Prime)?|LTX(?:\s*[- ]?\s*\d+(?:\.\d+)?)?)/i)?.[1] ?? null;
  return { prompt: (quoted ?? clean.split(/\bVoiceover\s*:/i)[0]!).trim(), originalMessage: message, editingInstructions: edit.trim(), voiceover, duration: duration ? Number(duration) : null, aspectRatio: ratio, resolution, requestedModel: model };
}

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function directVideoOptions(brief: DirectVideoBrief, referenceCount: number, available: Set<string>): Omit<DirectVideoPreparation, "brief" | "referenceIds"> {
  const missing: string[] = [];
  if (!brief.duration) missing.push("duration");
  if (!brief.aspectRatio) missing.push("aspect ratio");
  if (!brief.resolution) missing.push("resolution");
  if (!referenceCount) missing.push("reference images");
  const options: DirectVideoOption[] = [];
  const endpoints = new Set<string>();
  const selected = { ...brief, duration: brief.duration ?? 30, aspectRatio: brief.aspectRatio ?? "9:16", resolution: brief.resolution ?? "1080p" };
  const supportedDuration = (DIRECT_VIDEO_DURATIONS as readonly number[]).includes(selected.duration);
  if (supportedDuration && referenceCount > 0 && brief.prompt.length <= 5000 && referenceCount <= 20 && ["9:16", "16:9", "1:1"].includes(selected.aspectRatio)) {
    for (const cap of listCreativeCapabilities()) {
      if (cap.provider !== "higgsfield" || cap.output !== "video" || cap.status !== "supported" || !available.has(cap.id)) continue;
      if (endpoints.has(cap.endpoint ?? cap.id)) continue;
      const controls = new Map((cap.controls ?? []).map((control) => [control.key, control]));
      if (!controls.has("image_urls") || !controls.has("duration") || !controls.has("aspect_ratio")) continue;
      // Direct final delivery requires a documented output resolution; never infer 1080p from a quality mode.
      if (!controls.has("resolution")) continue;
      const settings: Record<string, unknown> = { prompt: brief.prompt, duration: selected.duration, aspect_ratio: selected.aspectRatio, resolution: selected.resolution };
      if (controls.has("generate_audio")) settings["generate_audio"] = false;
      if (controls.has("sound")) settings["sound"] = "off";
      try {
        const validated = validateCreativeSettings(cap.id, { ...settings, image_urls: Array.from({ length: referenceCount }, (_, index) => `https://references.example.com/${index}.jpg`) });
        if (creativeSettingsDuration(validated) !== selected.duration) continue;
        delete validated["image_urls"];
        if (Object.keys(validated).some((key) => /url|source|custom_images|custom_videos|custom_logo/i.test(key))) continue;
        options.push({ capabilityId: cap.id, label: cap.label, settings: validated });
        endpoints.add(cap.endpoint ?? cap.id);
      } catch { /* An incompatible schema is an unavailable choice, never a coerced request. */ }
    }
  }
  const requested = brief.requestedModel && normalized(brief.requestedModel);
  const exact = requested ? options.filter((option) => {
    const capability = getCreativeCapability(option.capabilityId);
    return normalized(capability.family ?? "") === requested || normalized(capability.label.split(/[·—]/)[0]!) === requested;
  }) : [];
  const matchedCapabilityId = !missing.length && exact.length === 1 ? exact[0]!.capabilityId : null;
  const reason = !supportedDuration ? `${selected.duration}-second direct films cannot be saved by this workspace. Choose 15 or 30 seconds before generation.` : missing.length ? `Choose ${missing.join(", ")} before generation.` : brief.prompt.length > 5000 ? "The model prompt exceeds 5,000 characters. Shorten the production prompt before generating." : referenceCount > 20 ? "Choose at most 20 reference images for one direct video." : requested && !matchedCapabilityId ? `${brief.requestedModel} is not an exact compatible connected route for these settings. Choose a supported model below; Sam will not substitute it silently.` : !options.length ? "No connected reference-video model supports this exact image count, duration, shape and resolution." : matchedCapabilityId ? "Your requested model and settings are supported." : "Choose a reference-video model to begin.";
  return { options, missing, reason, matchedCapabilityId };
}
