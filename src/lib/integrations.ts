// Client-safe integration rules.
export { VIDEO_SIZES } from "./content-rules";

export type VoicePick = { id: string; name: string; labels?: Record<string, string> | undefined };

/** Built-in AutoSocials narrator voices (OpenAI text-to-speech). Ids are prefixed so the render step knows the source. */
export const BUILTIN_PREFIX = "builtin:";
export const BUILTIN_VOICES: { name: string; labels: Record<string, string> }[] = [
  { name: "Kore", labels: { gender: "female", descriptive: "firm, confident" } },
  { name: "Aoede", labels: { gender: "female", descriptive: "breezy, friendly" } },
  { name: "Leda", labels: { gender: "female", descriptive: "youthful, bright" } },
  { name: "Zephyr", labels: { gender: "female", descriptive: "upbeat" } },
  { name: "Puck", labels: { gender: "male", descriptive: "upbeat, playful" } },
  { name: "Charon", labels: { gender: "male", descriptive: "informative, calm" } },
  { name: "Fenrir", labels: { gender: "male", descriptive: "excitable" } },
  { name: "Orus", labels: { gender: "male", descriptive: "firm, steady" } },
];

export const BUILTIN_NAMES = BUILTIN_VOICES.map((v) => v.name);
export const DEFAULT_BUILTIN = `${BUILTIN_PREFIX}Kore`;

/** Order: card override, starred brand voice (unless Sam may choose), Sam's batch pick, then Kore. */
export function resolveVoice(
  variantVoice: string | null | undefined,
  settings: { brand_voice_id?: string | null; auto_pick?: boolean | null } | null | undefined,
  batchVoice: string | null | undefined,
): string {
  if (variantVoice) return variantVoice;
  if (settings?.brand_voice_id && !settings.auto_pick) return settings.brand_voice_id;
  return toBuiltinId(batchVoice) ?? settings?.brand_voice_id ?? DEFAULT_BUILTIN;
}

/** Accepts "Kore" or "builtin:Kore"; returns null for anything not on the free list. */
export function toBuiltinId(v: string | null | undefined): string | null {
  if (!v) return null;
  const name = v.startsWith(BUILTIN_PREFIX) ? v.slice(BUILTIN_PREFIX.length) : v;
  return BUILTIN_NAMES.includes(name) ? `${BUILTIN_PREFIX}${name}` : null;
}

/** Which engine speaks a saved voice id. */
export function voiceSource(id: string): "builtin" | "elevenlabs" {
  return id.startsWith(BUILTIN_PREFIX) ? "builtin" : "elevenlabs";
}

/** Workspace key wins when the workspace chose its own account; otherwise the platform key. */
export function pickKeySource(opts: { useOwnKey: boolean; hasWorkspaceKey: boolean; hasPlatformKey: boolean }): "workspace" | "platform" | null {
  if (opts.useOwnKey && opts.hasWorkspaceKey) return "workspace";
  if (opts.useOwnKey) return null; // chose own account but hasn't added a key yet
  return opts.hasPlatformKey ? "platform" : null;
}

/** Ensures exactly one brand voice which is also in the allowed list. */
export function normaliseVoices(brand: VoicePick | null, allowed: VoicePick[]): { brand: VoicePick | null; allowed: VoicePick[] } {
  const map = new Map(allowed.map((v) => [v.id, v]));
  if (brand) map.set(brand.id, brand);
  return { brand, allowed: [...map.values()] };
}
