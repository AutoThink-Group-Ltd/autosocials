import { z } from "zod";
import { CREATIVE_DIRECTION_SCHEMA, parseCreativeDirection, type CreativeDirection } from "./creative-direction";
import { getCreativeCapability, type CreativeCapabilityId } from "./creative-providers/registry";

export const MAX_PROVIDER_STEPS = 6;
export const REFERENCE_ROLES = ["product", "identity", "style", "first_frame", "middle_keyframe", "last_frame", "source_footage", "motion", "audio", "document", "reference"] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];
export type ProductionReference = { source: "file" | "step"; id: string; role: ReferenceRole };
export type ProductionStep = { id: string; capability_id: CreativeCapabilityId; purpose: string; role: "scene" | "finished_video"; settings: Record<string, unknown>; reference_file_ids: string[]; reference_step_ids: string[]; reference_roles?: ProductionReference[]; illustrative: boolean };
export type ProductionPlan = { version: 1; direction: CreativeDirection | null; steps: ProductionStep[]; assumptions: string[]; diversity_issues: string[] };
const stepSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,30}$/), capability_id: z.string().max(100), purpose: z.string().min(1).max(500), role: z.enum(["scene", "finished_video"]), settings_json: z.string().min(2).max(18000), reference_file_ids: z.array(z.string().uuid()).max(20), reference_step_ids: z.array(z.string().max(31)).max(6), reference_roles: z.array(z.object({ source: z.enum(["file", "step"]), id: z.string().max(60), role: z.enum(REFERENCE_ROLES) }).strict()).max(20).optional(), illustrative: z.boolean() });
export const PRODUCTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["direction", "steps", "assumptions"], properties: {
    direction: CREATIVE_DIRECTION_SCHEMA,
    assumptions: { type: "array", items: { type: "string" } },
    steps: { type: "array", maxItems: MAX_PROVIDER_STEPS, items: { type: "object", additionalProperties: false, required: ["id", "capability_id", "purpose", "role", "settings_json", "reference_file_ids", "reference_step_ids", "reference_roles", "illustrative"], properties: {
      id: { type: "string" }, capability_id: { type: "string" }, purpose: { type: "string" }, role: { type: "string", enum: ["scene", "finished_video"] }, settings_json: { type: "string" }, reference_file_ids: { type: "array", items: { type: "string" } }, reference_step_ids: { type: "array", items: { type: "string" } }, reference_roles: { type: "array", items: { type: "object", additionalProperties: false, required: ["source", "id", "role"], properties: { source: { type: "string", enum: ["file", "step"] }, id: { type: "string" }, role: { type: "string", enum: [...REFERENCE_ROLES] } } } }, illustrative: { type: "boolean" },
    } } },
  },
} as const;

/** Model output is never an authority for capabilities, tenant references or provider URLs. */
export function parseProductionProposal(value: unknown, ownFiles: Set<string>, available: Set<string>): ProductionPlan {
  const raw = z.object({ direction: z.unknown(), steps: z.array(stepSchema).max(MAX_PROVIDER_STEPS), assumptions: z.array(z.string().max(500)).max(12) }).parse(value);
  const direction = parseCreativeDirection(raw.direction);
  if (!direction) throw new Error("The concept needs a complete creative direction.");
  const seen = new Set<string>();
  const steps = raw.steps.map((step, index): ProductionStep => {
    const cap = getCreativeCapability(step.capability_id);
    if (cap.id === "autotoast-hyperframes" || cap.status !== "supported" || !available.has(cap.id)) throw new Error("A concept selected a creative capability that is not connected.");
    if (seen.has(step.id) || step.reference_step_ids.some((id) => !seen.has(id))) throw new Error("Production references must point to earlier, unique steps.");
    if (step.reference_file_ids.some((id) => !ownFiles.has(id))) throw new Error("Production references must belong to this business.");
    if (step.reference_roles?.some((ref) => ref.source === "file" ? !step.reference_file_ids.includes(ref.id) : !step.reference_step_ids.includes(ref.id))) throw new Error("A production role must name an authorised reference in this step.");
    if (step.role === "finished_video" && (cap.output !== "video" || index !== raw.steps.length - 1)) throw new Error("Only the final video step can deliver the finished film.");
    let settings: unknown;
    try { settings = JSON.parse(step.settings_json); } catch { throw new Error("Invalid provider settings."); }
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid provider settings.");
    // Signed asset URLs are resolved server-side immediately before a paid call.
    if (Object.keys(settings).some((key) => /url|source|custom_images|custom_videos|custom_logo|image_input/i.test(key))) throw new Error("Media inputs must use authorised reference IDs, not URLs.");
    if (!step.illustrative && ["higgsfield", "kie"].includes(cap.provider)) throw new Error("Generated scenes must be marked illustrative.");
    seen.add(step.id);
    return { id: step.id, capability_id: cap.id, purpose: step.purpose, role: step.role, settings: settings as Record<string, unknown>, reference_file_ids: step.reference_file_ids, reference_step_ids: step.reference_step_ids, ...(step.reference_roles ? { reference_roles: step.reference_roles } : {}), illustrative: step.illustrative };
  });
  return { version: 1, direction, steps, assumptions: raw.assumptions, diversity_issues: [] };
}

/** Reconcile advisory model role labels with the explicitly selected media. */
export function reconcileProductionReferences(value: unknown, selectedFiles: readonly string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const proposal = value as Record<string, unknown>;
  if (!Array.isArray(proposal.steps)) return value;
  const allowed = new Set(selectedFiles);
  const earlier = new Set<string>();
  return { ...proposal, steps: proposal.steps.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const step = item as Record<string, unknown>;
    const files = Array.isArray(step.reference_file_ids) ? step.reference_file_ids.filter((id): id is string => typeof id === "string" && allowed.has(id)) : [];
    const prior = Array.isArray(step.reference_step_ids) ? step.reference_step_ids.filter((id): id is string => typeof id === "string" && earlier.has(id)) : [];
    const roles = Array.isArray(step.reference_roles) ? step.reference_roles.filter((role): role is ProductionReference => {
      if (!role || typeof role !== "object" || Array.isArray(role)) return false;
      const ref = role as Record<string, unknown>;
      return ref.source === "file" ? typeof ref.id === "string" && allowed.has(ref.id) : ref.source === "step" && typeof ref.id === "string" && earlier.has(ref.id);
    }) : [];
    for (const role of roles) {
      if (role.source === "file" && !files.includes(role.id)) files.push(role.id);
      if (role.source === "step" && !prior.includes(role.id)) prior.push(role.id);
    }
    if (typeof step.id === "string") earlier.add(step.id);
    let settingsJson = step.settings_json;
    if (typeof settingsJson === "string") {
      try {
        const settings = JSON.parse(settingsJson);
        if (settings && typeof settings === "object" && !Array.isArray(settings)) {
          for (const key of Object.keys(settings)) {
            if (/url|source|custom_images|custom_videos|custom_logo|image_input/i.test(key)) delete settings[key];
          }
          if (step.capability_id === "golpo-canvas" || step.capability_id === "golpo-sketch") {
            if (!["female-1", "female-2", "male-1", "male-2"].includes(settings.narration_voice)) settings.narration_voice = "female-1";
            // A position without an authorised custom logo is invalid in Golpo.
            delete settings.logo_position;
          }
          settingsJson = JSON.stringify(settings);
        }
      } catch { /* The strict parser reports malformed settings. */ }
    }
    return { ...step, settings_json: settingsJson, reference_file_ids: files, reference_step_ids: prior, reference_roles: roles };
  }) };
}

export function readProductionPlan(value: unknown): ProductionPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { version: 1, direction: null, steps: [], assumptions: [], diversity_issues: [] };
  const raw = value as Partial<ProductionPlan>;
  return { version: 1, direction: parseCreativeDirection(raw.direction), steps: Array.isArray(raw.steps) ? raw.steps.slice(0, MAX_PROVIDER_STEPS) : [], assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.filter((v): v is string => typeof v === "string") : [], diversity_issues: Array.isArray(raw.diversity_issues) ? raw.diversity_issues.filter((v): v is string => typeof v === "string") : [] };
}

export function productionProposal(plan: ProductionPlan) {
  return { direction: plan.direction, assumptions: plan.assumptions, steps: plan.steps.map(({ settings, ...step }) => ({ ...step, settings_json: JSON.stringify(settings) })) };
}

/** Replanning preserves older drafts; Create acts only on the most recent explicitly planned set. */
export function activePlanningVariants<T extends { position: number; production_plan?: unknown }>(variants: T[], activePlanId?: string | null): T[] {
  const planId = (row: T) => row.production_plan && typeof row.production_plan === "object" && !Array.isArray(row.production_plan) ? (row.production_plan as Record<string, unknown>)["plan_id"] : undefined;
  if (activePlanId) return variants.filter((row) => planId(row) === activePlanId);
  const latest = [...variants].sort((a, b) => b.position - a.position).find((row) => typeof planId(row) === "string");
  return latest ? variants.filter((row) => planId(row) === planId(latest)) : variants;
}
