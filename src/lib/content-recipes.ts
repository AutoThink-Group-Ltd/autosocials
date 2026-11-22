import { z } from "zod";
/** Business-facing recipes. Models remain implementation details and historical IDs remain valid. */
export const CONTENT_RECIPES = [
  { id: "branded-motion", name: "Branded motion", styleId: "brand-motion", eyebrow: "Make your message move", description: "Sharp typography, expressive graphics and your own media, shaped into a branded film.", uses: "Benefits · offers · launches", media: "Brand information", music: "Optional licensed track" },
  { id: "illustrated-explainer", name: "Illustrated explainer", styleId: "illustrated-explainer", eyebrow: "Make the complex click", description: "An illustrated story that turns a product, service or difficult idea into something clear.", uses: "Education · FAQs · how it works", media: "Verified explanation", music: "Provider audio options" },
  { id: "cinematic-ad", name: "Cinematic ad", styleId: "cinematic-scene", eyebrow: "A story worth stopping for", description: "Illustrative cinematic footage, finished with your message, narration and branding.", uses: "Brand stories · atmosphere · launches", media: "Real media for factual portrayals", music: "Optional licensed track" },
  { id: "reaction-demo", name: "Reaction + demo", styleId: "reaction-ugc", eyebrow: "The wow. Then the how.", description: "A clearly illustrative reaction hook, followed by your real product, app or service in action.", uses: "App demos · product reveals · results", media: "Real demonstration video", music: "Optional licensed track" },
] as const;
export type ContentRecipeId = typeof CONTENT_RECIPES[number]["id"];
/** Reuse Sam's idea/treatment rather than spending another model call for a UI default. */
export function recommendContentRecipe(context: string, suggestedStyleId?: string, available: (style: string) => boolean = () => true) {
  const visibleRecipes = CONTENT_RECIPES.filter((recipe) => recipe.id !== "cinematic-ad");
  const suggested = visibleRecipes.find((recipe) => recipe.styleId === suggestedStyleId);
  const text = context.toLowerCase();
  const preferred = suggested ?? visibleRecipes.find((recipe) => recipe.id === (
    /reaction|shocked|wow|screen.?record|app demo|walkthrough/.test(text) ? "reaction-demo" :
    /typograph|motion graphic|opening text|headline|since 20|brand(ed)? motion/.test(text) ? "branded-motion" :
    /illustrat|explain|how it works|faq|educat/.test(text) ? "illustrated-explainer" :
    "branded-motion"));
  const recipe = preferred && available(preferred.styleId) ? preferred : visibleRecipes.find((item) => available(item.styleId));
  if (!recipe) return undefined;
  const reasons: Record<ContentRecipeId, string> = {
    "branded-motion": "Clear branded graphics put this idea's message first and can use your existing assets.",
    "illustrated-explainer": "An illustrated explanation fits this idea's educational message.",
    "cinematic-ad": "Cinematic footage fits this idea's visual story and atmosphere.",
    "reaction-demo": "A reaction hook followed by a real demonstration fits this idea.",
  };
  return { id: recipe.id, styleId: recipe.styleId, reason: reasons[recipe.id] };
}
export const recipeForStyle = (styleId?: string) => CONTENT_RECIPES.find((recipe) => recipe.styleId === styleId);
export type CreationFile = { id: string; name: string; kind: string; source?: string | null; ai_label?: string | null; ai_summary?: string | null };
export type CreationState = { version: 1; recipe_id: ContentRecipeId; style_id: string; file_ids: string[]; music_file_id?: string; music_rights_confirmed?: boolean; duration?: 15 | 30 | 60; size?: string; captions?: "clean" | "off"; voice?: string; note?: string; status: "idea_ready" | "waiting_for_assets" | "ready_to_create"; deferred: boolean; alternative?: "graphics"; missing_inputs: string[]; updated_at: string };
export function readCreationState(value: unknown): CreationState | null {
  const parsed = z.object({ version: z.literal(1), recipe_id: z.enum(["branded-motion", "illustrated-explainer", "cinematic-ad", "reaction-demo"]), style_id: z.string(), file_ids: z.array(z.string().uuid()).max(20), music_file_id: z.string().uuid().optional(), music_rights_confirmed: z.boolean().optional(), duration: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(), size: z.enum(["1080x1920", "1080x1080", "1080x1350", "1920x1080"]).optional(), captions: z.enum(["clean", "off"]).optional(), voice: z.string().max(128).optional(), note: z.string().max(300).optional(), status: z.enum(["idea_ready", "waiting_for_assets", "ready_to_create"]), deferred: z.boolean(), alternative: z.literal("graphics").optional(), missing_inputs: z.array(z.string()).max(20), updated_at: z.string() }).safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.recipe_id === "reaction-demo" && parsed.data.style_id === "reference-story") return { ...parsed.data, style_id: "reaction-ugc", status: "idea_ready" };
  if (CONTENT_RECIPES.find((recipe) => recipe.id === parsed.data.recipe_id)?.styleId !== parsed.data.style_id) return null;
  return parsed.data;
}
export function creationRequirements(recipeId: ContentRecipeId, files: CreationFile[], selectedIds: string[], message: string) {
  const selected = files.filter((file) => selectedIds.includes(file.id));
  const media = selected.filter((file) => ["image", "video"].includes(file.kind) && file.source !== "shutterstock" && !/logo|illustrative stock|shutterstock/i.test(`${file.ai_label ?? ""} ${file.name}`));
  const demonstrations = media.filter((file) => file.kind === "video");
  if (recipeId === "reaction-demo" && !demonstrations.length) return ["A real demonstration video of the product, app or service"];
  if (recipeId === "cinematic-ad" && /\b(property|properties|product|products|office|team|customer|testimonial)\b/i.test(message) && !media.length) return ["Real photos or footage for the specific property, product or people this idea portrays"];
  return [];
}
export function agentAssetBrief(input: { business: string; idea: string; recipeId: ContentRecipeId; needs: string[] }) {
  const recipe = CONTENT_RECIPES.find((item) => item.id === input.recipeId)!;
  const demo = input.recipeId === "reaction-demo";
  return `# AutoSocials asset collection brief\n\nBusiness: ${input.business}\nApproved idea: ${input.idea}\nStyle: ${recipe.name}\n\n## What to collect\n${input.needs.length ? input.needs.map((need) => `- ${need}`).join("\n") : "- Relevant approved brand assets for this idea; do not create unsupported claims."}\n\n## Package\n${demo ? "- /screenshots: current screenshots showing the named feature or process, PNG/JPEG\n- /recordings: short MP4/WebM walkthrough using demo data\n" : "- /images: original authorised property/product/service images, PNG/JPEG/WebP\n- /footage: relevant original MP4/WebM clips if available\n"}- /brand: logo and available brand guidance\n- /facts.md: approved claims, descriptions, source URLs and dates checked\n- /manifest.json: filenames, descriptions, source URLs and usage/permission notes\n\nUse original resolution, ideally at least 1080 pixels on the long edge. Preserve real products, properties and interfaces. Do not invent results, testimonials or endorsements. Use demo data; exclude customer records, passwords, login cookies, API keys and other secrets.\n\nFor test access, provide the account role and access instructions through the approved secure access channel, never in this ZIP.\n\nReturn one ZIP named business-idea-assets.zip. You may also upload the individual files to AutoSocials.\n`;
}
