import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL, seoRoutes } from "@/lib/seo-routes";
import { developerMarkdown } from "@/features/developers/content";

// Full answer-engine index generated from the public page inventory.
export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () => {
        const pages = seoRoutes.filter((r) => !r.noIndex);
        const body = [
          "# AutoSocials — full page index",
          "",
          "> AI social growth workspace for brands and agencies, run by the agent Sam.",
          "",
          "## Public pages",
          ...pages.flatMap((r) => [
            "",
            `### ${r.title}`,
            `URL: ${SITE_URL}${r.path === "/" ? "/" : r.path}`,
            r.description,
            ...(r.bodyContent ?? []),
          ]),
          "",
          "## Developer documentation",
          developerMarkdown(),
          "## Creator profiles",
          `Public creator profile pages live at ${SITE_URL}/{platform}/{username} and are listed in ${SITE_URL}/sitemap.xml.`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
