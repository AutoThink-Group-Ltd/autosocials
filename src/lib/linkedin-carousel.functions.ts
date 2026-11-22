import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { carouselPlanSchema } from "./linkedin-carousel";
import carouselPrompt from "../../prompts/create/linkedin-carousel.md?raw";

import artDirection from "../../prompts/create/social-art-direction.md?raw";
import { referenceIdsSchema } from "./social-design";
import { quotePlanningContext } from "./social-quote-sources";
import { creationContextModeSchema, hasCreationBrief } from "./creation-context-mode";

const identity = z.object({ workspace_id: z.string().uuid(), id: z.string().uuid() });
const planInput = z.object({ workspace_id: z.string().uuid(), reference_ids: referenceIdsSchema.optional(), brief: z.string().trim().max(12000), context_mode: creationContextModeSchema.optional() }).strict().refine(hasCreationBrief, "Enter your idea first.");
const saveInput = identity.extend({ plan: carouselPlanSchema, version: z.string().optional() }).strict();
const slideInput = identity.extend({ slide_id: z.string().uuid(), version: z.string().min(1), image_base64: z.string().min(1).max(4_000_000) }).strict();
const workspaceInput = z.object({ workspace_id: z.string().uuid() }).strict();

const plan = createServerOnlyFn(async (input: z.infer<typeof planInput>) => {
  const { requireUser, getAdminClient } = await import("./supabase-admin.server");
  const { loadCreativeContext } = await import("./creative-context.server");
  const { aiChat } = await import("./dossier.server");
  const user = await requireUser();
  const admin = getAdminClient();
  const { data: allowed, error } = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: input.workspace_id });
  if (error || !allowed) throw new Error("Workspace access denied.");
  const brief = input.context_mode === "goals" ? "" : input.brief;
  const context = await loadCreativeContext(admin, input.workspace_id, brief, input.reference_ids?.length ? input.reference_ids : undefined, undefined, input.context_mode);
  if (input.reference_ids?.some(id => !context.imageParts.some(image => image.fileId === id))) throw new Error("A selected reference could not be read. Choose a supported workspace image.");
  let response: Awaited<ReturnType<typeof aiChat>>;
  try {
    response = await aiChat({
      model: "gpt-6.1-terra",
      messages: [
        { role: "system", content: [carouselPrompt, artDirection, quotePlanningContext(brief)].join("\n") },
        { role: "user", content: [{ type: "text", text: context.text }, ...context.imageParts.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } }))] },
      ],
      response_format: { type: "json_object" },
    });
  } catch {
    throw new Error("Sam couldn't prepare the carousel. Please try again.");
  }
  try {
    const result = JSON.parse(response.choices?.[0]?.message?.content ?? "");
    const { carouselDraftSchema } = await import("./linkedin-carousel");
    const { prepareDesignItems } = await import("./social-design-planning.server");
    const proposed = carouselDraftSchema.parse(result);
    const slides = await prepareDesignItems(proposed.slides, brief, input.reference_ids ?? [], true);
    const draft = carouselPlanSchema.parse({ ...proposed, dnaVersionId: context.dnaVersionId, ...(input.context_mode === "standalone" ? { standalone: true } : {}), slides: slides.map((slide: object) => ({ ...slide, id: crypto.randomUUID() })) });
    const { researchCarouselPlan } = await import("./carousel-researched-plan.server");
    return await researchCarouselPlan(draft);
  } catch {
    throw new Error("Sam returned an incomplete carousel. Please try again.");
  }
});

const save = createServerOnlyFn(async (data: z.infer<typeof saveInput>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { saveCarouselForUser } = await import("./linkedin-carousel.server");
  return saveCarouselForUser((await requireUser()).id, data);
});
const saveSlide = createServerOnlyFn(async (data: z.infer<typeof slideInput>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { saveCarouselSlideForUser } = await import("./linkedin-carousel.server");
  return saveCarouselSlideForUser((await requireUser()).id, data);
});
const get = createServerOnlyFn(async (data: z.infer<typeof identity>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { getCarouselForUser } = await import("./linkedin-carousel.server");
  return getCarouselForUser((await requireUser()).id, data);
});
const list = createServerOnlyFn(async (data: z.infer<typeof workspaceInput>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { listCarouselsForUser } = await import("./linkedin-carousel.server");
  return listCarouselsForUser((await requireUser()).id, data.workspace_id);
});

export const planLinkedInCarousel = createServerFn({ method: "POST" }).inputValidator((input: unknown) => planInput.parse(input)).handler(({ data }) => plan(data));
export const saveLinkedInCarousel = createServerFn({ method: "POST" }).inputValidator((input: unknown) => saveInput.parse(input)).handler(({ data }) => save(data));
export const saveLinkedInCarouselSlide = createServerFn({ method: "POST" }).inputValidator((input: unknown) => slideInput.parse(input)).handler(({ data }) => saveSlide(data));
export const getLinkedInCarousel = createServerFn({ method: "POST" }).inputValidator((input: unknown) => identity.parse(input)).handler(({ data }) => get(data));
export const listLinkedInCarousels = createServerFn({ method: "POST" }).inputValidator((input: unknown) => workspaceInput.parse(input)).handler(({ data }) => list(data));
