import { z } from "zod";
import { designSchema, quoteEvidenceSchema } from "./social-design";

const productName = z.string().trim().min(1).max(80);
const productLogo = z.object({
  name: productName,
  sourceUrl: z.string().url().max(2048).regex(/^https:\/\//i),
  image: z.string().max(32_000).regex(/^(?:\/carousel-products\/[a-z0-9-]+\.png|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})$/),
  description: z.string().max(300).optional(),
}).strict();

export function carouselProductPosition(slide: { headline: string; supporting: string }, name: string) {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const target = normalize(name).join("");
  if (!target) return -1;
  let offset = 0;
  for (const field of [slide.headline, slide.supporting]) {
    const words = normalize(field);
    const index = words.findIndex((_, start) => {
      let phrase = "";
      for (let i = start; i < words.length && phrase.length < target.length; i++) phrase += words[i];
      return phrase === target;
    });
    if (index >= 0) return offset + index;
    offset += words.length;
  }
  return -1;
}

export function carouselMentionsProduct(slide: { headline: string; supporting: string }, name: string) {
  return carouselProductPosition(slide, name) >= 0;
}

export const carouselSlideSchema = z.object({
  id: z.string().uuid(),
  headline: z.string().trim().min(1).max(80),
  supporting: z.string().trim().min(1).max(180),
  direction: z.string().trim().min(1).max(240),
  products: z.array(productName).max(6).optional(),
  logos: z.array(productLogo).max(4).optional(),
  design: designSchema.optional(),
  quote: quoteEvidenceSchema.optional(),
  quoteNotice: z.string().max(500).optional(),
  artwork: z.object({ requestId: z.string().uuid(), fileId: z.string().uuid().optional() }).strict().optional(),
}).strict();

const carouselDraftSlideSchema = carouselSlideSchema.omit({ id: true, artwork: true });

export const carouselDraftSchema = z.object({
  dnaVersionId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  promise: z.string().trim().min(1).max(240),
  brand: z.string().trim().min(1).max(60),
  brandPrimary: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  brandAccent: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  slides: z.array(carouselDraftSlideSchema).min(2).max(6),
}).strict();

export const carouselPlanSchema = carouselDraftSchema.extend({
  standalone: z.literal(true).optional(),
  productionStarted: z.literal(true).optional(),
  slides: z.array(carouselSlideSchema).min(2).max(6),
}).refine((plan) => new Set(plan.slides.map((slide) => slide.id)).size === plan.slides.length, "Each slide needs a unique ID.")
  .refine((plan) => new Set(plan.slides.map((slide) => slide.design?.aspect ?? "square")).size === 1, "All slides must have the same aspect ratio.");

export type CarouselDraft = z.infer<typeof carouselDraftSchema>;
export type CarouselPlan = z.infer<typeof carouselPlanSchema>;
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

export function carouselInProduction(plan: CarouselPlan, renderedSlides: number) {
  return renderedSlides < plan.slides.length && (
    plan.productionStarted === true || renderedSlides > 0 ||
    plan.slides.some((slide) => slide.design?.treatment === "illustration" && !!slide.artwork && !slide.artwork.fileId)
  );
}

export function missingCarouselLogos(slide: CarouselDraft["slides"][number]) {
  return (slide.products ?? []).filter((name) => carouselMentionsProduct(slide, name) &&
    !slide.logos?.some((logo) => carouselMentionsProduct({ headline: name, supporting: "" }, logo.name)));
}

export function isLinkedInCarouselIdea(title: string, idea: { format?: string | undefined; carousel_plan?: CarouselDraft | undefined }) {
  const label = `${idea.format ?? ""} ${title}`;
  return !!idea.carousel_plan || (/\blinkedin\b/i.test(label) && /\bcarousels?\b/i.test(label));
}

export function carouselOutline(notes: string) {
  const parts = notes.split(/\s*(?=\b\d+\)\s)/);
  const start = parts.findIndex((part) => /^1\)\s/.test(part));
  const items = start < 0 ? [] : parts.slice(start);
  if (items.length < 2 || !items.every((item, i) => item.match(/^\d+/)?.[0] === String(i + 1))) {
    return { notes, slides: [] };
  }
  return {
    notes: parts.slice(0, start).join(" ").replace(/\s*(?:suggested\s+)?slide\s+(?:arc|outline):\s*$/i, "").trim(),
    slides: items.map((item) => item.replace(/^\d+\)\s+/, "").replace(/[,;]\s*$/, "").trim()),
  };
}
