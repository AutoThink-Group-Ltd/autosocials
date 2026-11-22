import { resolveCarouselProducts } from "./carousel-product-research.server";
import { carouselMentionsProduct, type CarouselDraft } from "./linkedin-carousel";

/** Only the research resolver supplies artwork. Keep the reviewed copy and slide IDs intact. */
export async function researchCarouselPlan<T extends CarouselDraft>(plan: T): Promise<T> {
  const matches = await resolveCarouselProducts(plan.slides);
  const slides = plan.slides.map(({ logos: _modelArtwork, products, ...slide }, index) => {
    const logos = matches[index] ?? [];
    const names = new Set((products ?? []).filter((name) => carouselMentionsProduct(slide, name)));
    return { ...slide, ...(names.size ? { products: [...names] } : {}), ...(logos.length ? { logos } : {}) };
  });
  return { ...plan, slides };
}
