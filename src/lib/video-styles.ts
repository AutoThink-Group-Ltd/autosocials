/** Client-safe names for real production routes. A style is intent, never proof of a paid render. */
import { z } from "zod";
import { getCreativeCapability, listCreativeCapabilities, type CreativeCapabilityId } from "./creative-providers/registry";

const establishedStyles = [
  { id: "kie-nano-image", name: "Kie Designed Visuals", capability_id: "kie-nano-image", description: "Generate Nano Banana 2 stills for an assembled branded film." },
  { id: "kie-nano-image-edit", name: "Kie Visual Remix", capability_id: "kie-nano-image-edit", description: "Adapt authorised reference images with Nano Banana 2." },
  { id: "kie-veo-text-video", name: "Kie Cinematic Scene", capability_id: "kie-veo-text-video", description: "Generate an eight-second Veo 3.1 scene for an assembled film." },
  { id: "kie-veo-image-video", name: "Kie Living Image", capability_id: "kie-veo-image-video", description: "Animate an authorised first frame and optional last frame with Veo 3.1." },
  { id: "kie-veo-reference-video", name: "Kie Reference Story", capability_id: "kie-veo-reference-video", description: "Guide an eight-second Veo 3.1 scene with one to three owned images." },
  { id: "brand-motion", name: "Branded Motion", capability_id: "autotoast-hyperframes", description: "Purposeful type, diagrams and owned photos or footage, composed to the brand." },
  { id: "cinematic-scene", name: "Cinematic Scene", capability_id: "higgsfield-seedance-text-video", description: "An illustrative scene directed from a written visual idea." },
  { id: "living-image", name: "Living Image", capability_id: "higgsfield-seedance-image-video", description: "Bring an authorised still to life with directed motion." },
  { id: "reference-story", name: "Reference Story", capability_id: "higgsfield-seedance-reference-video", description: "A new illustrative scene guided by authorised visual or audio references." },
  { id: "reaction-ugc", name: "Reaction + demo", capability_id: "heygen-avatar", description: "A presenter reacts alongside your real demonstration video." },
  { id: "directed-recut", name: "Directed Recut", capability_id: "higgsfield-seedance-video-edit", description: "Rework existing footage around a clear visual direction." },
  { id: "extended-moment", name: "Extended Moment", capability_id: "higgsfield-seedance-video-extend", description: "Continue a moment from authorised source footage." },
  { id: "camera-story", name: "Camera Story", capability_id: "higgsfield-ltx-fast-text-video", description: "A short illustrative scene shaped by an intentional camera move." },
  { id: "keyframe-journey", name: "Keyframe Journey", capability_id: "higgsfield-ltx-fast-image-video", description: "Animate between owned keyframes with deliberate camera movement." },
  { id: "storyboard-cinema", name: "Storyboard Cinema", capability_id: "higgsfield-kling3-image-video", description: "A cinematic shot or short sequence directed from an authorised image." },
  { id: "first-to-last", name: "First to Last", capability_id: "higgsfield-kling-o3-keyframes", description: "A visual transition directed by its opening and closing frames." },
  { id: "reference-montage", name: "Reference Montage", capability_id: "higgsfield-wan-reference-video", description: "An illustrative visual story informed by multiple authorised references." },
  { id: "cinematic-restyle", name: "Cinematic Restyle", capability_id: "higgsfield-genjutsu-restyle", description: "Give existing footage a documented visual treatment while retaining its motion." },
  { id: "motion-remix", name: "Motion Remix", capability_id: "higgsfield-genjutsu-motion-transfer", description: "Transfer the movement of owned footage to authorised appearance references." },
  { id: "scene-remix", name: "Scene Remix", capability_id: "higgsfield-genjutsu-object-swap", description: "Replace an object in owned footage with an authorised visual reference." },
  { id: "designed-visuals", name: "Designed Visuals", capability_id: "higgsfield-image-generate", description: "Create illustrative stills as ingredients for an assembled motion film." },
  { id: "visual-remix", name: "Visual Remix", capability_id: "higgsfield-image-edit", description: "Adapt authorised stills into designed visuals for an assembled film." },
  { id: "art-directed-look", name: "Art Directed Look", capability_id: "higgsfield-image-preset", description: "Apply a currently available image preset to authorised references, then assemble a film." },
  { id: "illustrated-explainer", name: "Illustrated Explainer", capability_id: "golpo-canvas", description: "Explain an idea through illustrated scenes using a documented Canvas treatment." },
  { id: "drawn-explainer", name: "Drawn Explainer", capability_id: "golpo-sketch", description: "Tell a clear story through a documented hand-drawn Sketch treatment." },
] as const satisfies ReadonlyArray<{ id: string; name: string; capability_id: CreativeCapabilityId; description: string }>;
const establishedCapabilities = new Set(establishedStyles.map((style) => style.capability_id));
const catalogueStyles = listCreativeCapabilities().filter((capability) => capability.provider === "higgsfield" && capability.status === "supported" && !establishedCapabilities.has(capability.id as never)).map((capability) => ({
  id: capability.id,
  name: capability.label,
  capability_id: capability.id,
  description: capability.output === "image" ? "Create brand-guided imagery for a composed video." : "Generate a model-specific shot for the selected story.",
}));
export const VIDEO_STYLES = [...establishedStyles, ...catalogueStyles];

export const VIDEO_STYLE_IDS = VIDEO_STYLES.map((style) => style.id) as [typeof VIDEO_STYLES[number]["id"], ...typeof VIDEO_STYLES[number]["id"][]];
export type VideoStyleId = typeof VIDEO_STYLES[number]["id"];
export const VIDEO_STYLE_SELECTION_SCHEMA = z.object({
  id: z.enum(VIDEO_STYLE_IDS), name: z.string().max(100),
  engine_ids: z.array(z.string().refine((id) => listCreativeCapabilities().some((capability) => capability.id === id && capability.status === "supported"))).min(1).max(7),
  engine_labels: z.array(z.string().max(200)).min(1).max(7),
  availability: z.enum(["configured_unverified", "unavailable", "legacy_inferred"]),
});
export type VideoStyleSelection = Omit<z.infer<typeof VIDEO_STYLE_SELECTION_SCHEMA>, "engine_ids"> & { engine_ids: CreativeCapabilityId[] };
export type StyledProductionPlan = import("./production-plan").ProductionPlan & { video_style: VideoStyleSelection };
type PlanLike = { steps: Array<{ capability_id: string; role?: string }> };

export const getVideoStyle = (id: string) => VIDEO_STYLES.find((style) => style.id === id);
export function listVideoStyles(available?: Set<string>) {
  return VIDEO_STYLES.map((style) => { const capability = getCreativeCapability(style.capability_id); return { ...style, engine: capability.label,
    provider: capability.provider === "kie" ? "Kie" : capability.provider === "autotoast" ? "HyperFrames" : capability.provider === "golpo" ? "Golpo" : capability.provider === "heygen" ? "HeyGen" : "Higgsfield",
    family: capability.family ?? (capability.provider === "autotoast" ? "HyperFrames" : capability.provider === "golpo" ? "Golpo" : capability.label.split(" · ")[0] ?? "Higgsfield"),
    output: capability.output, inputModes: capability.inputs,
    requiredInputs: (capability.controls ?? []).filter((control) => control.required && (control.type === "url" || /(?:^|_)urls?$|reference|image|video|audio|character/i.test(control.key))).map((control) => control.label),
    verification: capability.verification ?? null,
    availability: available?.has(style.capability_id) ? "configured_unverified" as const : "unavailable" as const,
  }; });
}

/** Primary engine identity excludes the compositor when it only assembles provider ingredients. */
export function productionEngineIds(plan: PlanLike): CreativeCapabilityId[] {
  const ids = [...new Set(plan.steps.map((step) => step.capability_id))];
  return (ids.length ? ids : ["autotoast-hyperframes"]) as CreativeCapabilityId[];
}

export function selectVideoStyle(id: string, plan: PlanLike, available: Set<string>): VideoStyleSelection {
  const style = getVideoStyle(id);
  if (!style) throw new Error("Sam must choose a supported video style.");
  const engineIds = productionEngineIds(plan);
  const usesCompositor = !plan.steps.some((step) => step.role === "finished_video");
  if (!engineIds.includes(style.capability_id) && !(style.capability_id === "autotoast-hyperframes" && usesCompositor)) {
    throw new Error(`The ${style.name} style does not match its intended production engine.`);
  }
  return { id: style.id, name: style.name, engine_ids: engineIds, engine_labels: engineIds.map((engine) => getCreativeCapability(engine).label),
    availability: engineIds.every((engine) => available.has(engine)) ? "configured_unverified" : "unavailable" };
}

/** Rebuild labels from the registry so saved or model-written display names cannot invent an engine. */
export function readVideoStyle(value: unknown): VideoStyleSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const raw = VIDEO_STYLE_SELECTION_SCHEMA.safeParse(record["video_style"] ?? record);
  if (!raw.success) return null;
  const style = getVideoStyle(raw.data.id)!;
  const engineIds = [...new Set(raw.data.engine_ids)] as CreativeCapabilityId[];
  return { ...raw.data, name: style.name, engine_ids: engineIds, engine_labels: engineIds.map((engine) => getCreativeCapability(engine).label) };
}

export function videoStyleForNarrative(narrative: { video_style?: unknown; production?: unknown }): VideoStyleSelection | null {
  const saved = readVideoStyle(narrative.video_style) ?? readVideoStyle(narrative.production);
  if (saved) return saved;
  if (!narrative.production || typeof narrative.production !== "object" || Array.isArray(narrative.production)) return null;
  const steps = (narrative.production as Record<string, unknown>)["steps"];
  if (!Array.isArray(steps) || steps.some((step) => !step || typeof step.capability_id !== "string")) return null;
  const engineIds = productionEngineIds({ steps });
  const style = VIDEO_STYLES.find((candidate) => candidate.capability_id === engineIds[0]);
  if (!style || engineIds.some((engine) => !VIDEO_STYLES.some((candidate) => candidate.capability_id === engine))) return null;
  return { id: style.id, name: style.name, engine_ids: engineIds, engine_labels: engineIds.map((engine) => getCreativeCapability(engine).label), availability: "legacy_inferred" };
}

/** A historical route can explain an older draft without becoming a selected-style constraint. */
export function selectedVideoStyleForNarrative(narrative: { video_style?: unknown; production?: unknown }): VideoStyleSelection | null {
  const saved = readVideoStyle(narrative.video_style) ?? readVideoStyle(narrative.production);
  return saved && saved.availability !== "legacy_inferred" ? saved : null;
}

export const styleEngineLabel = (style: VideoStyleSelection | null | undefined) => style?.engine_labels.join(" + ") || "Engine selected during planning";
