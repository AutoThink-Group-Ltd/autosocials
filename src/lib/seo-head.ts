import { SITE_NAME, SITE_URL, seoRoutes } from "./seo-routes";

/**
 * Builds a TanStack route `head()` result for a public page registered in
 * seo-routes.ts (title, description, canonical, OG/Twitter, JSON-LD).
 * Server rendering emits these tags directly into the HTML for crawlers.
 */
export function seoHead(path: string) {
  const route = seoRoutes.find((r) => r.path === path);
  if (!route) return {};
  // Only tag a share image when a real one exists (no placeholder).
  const ogImage = route.ogImage;
  const canonicalUrl = `${SITE_URL}${route.path === "/" ? "/" : route.path}`;
  return {
    meta: [
      { title: route.title },
      { name: "description", content: route.description },
      { name: "author", content: SITE_NAME },
      { property: "og:title", content: route.title },
      { property: "og:description", content: route.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl },
      ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: route.title },
      { name: "twitter:description", content: route.description },
      ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
      ...(route.noIndex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(route.jsonLd) }],
  };
}
