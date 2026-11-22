import { SITE_URL, seoRoutes } from "@/lib/seo-routes";

export function publicPageSitemap() {
  const entries = seoRoutes
    .filter((route) => !route.noIndex)
    .map((route) => {
      const location = (SITE_URL + route.path)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return "  <url><loc>" + location + "</loc></url>";
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");
}

export function addDeveloperUrls(xml: string, upstreamOk: boolean) {
  const closing = "</urlset>";
  const valid = upstreamOk && xml.includes("<urlset") && xml.includes(closing);
  if (!valid) return { body: xml, valid: false };
  const additions = seoRoutes
    .filter(
      (route) =>
        !route.noIndex &&
        (route.path === "/developers" || route.path.startsWith("/developers/")),
    )
    .map((route) => `${SITE_URL}${route.path}`)
    .filter((url) => !xml.includes(`<loc>${url}</loc>`))
    .map((url) => `  <url><loc>${url}</loc></url>\n`)
    .join("");
  return { body: xml.replace(closing, `${additions}${closing}`), valid: true };
}
