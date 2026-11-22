import { createFileRoute } from "@tanstack/react-router";
import {
  addDeveloperUrls,
  publicPageSitemap,
} from "@/features/developers/sitemap";

// Preserve indexed site pages when the optional creator sitemap is unavailable.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const base =
          process.env["SUPABASE_URL"] ?? import.meta.env.VITE_SUPABASE_URL;
        const creatorSitemap = base
          ? await fetch(`${base}/functions/v1/generate-sitemap`, {
              signal: AbortSignal.timeout(3000),
            })
              .then(async (response) =>
                response.ok
                  ? addDeveloperUrls(await response.text(), true)
                  : null,
              )
              .catch(() => null)
          : null;
        const fromUpstream = creatorSitemap?.valid === true;
        return new Response(
          fromUpstream ? creatorSitemap.body : publicPageSitemap(),
          {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": fromUpstream
                ? "public, max-age=3600, s-maxage=86400"
                : "public, max-age=300, s-maxage=300",
            },
          },
        );
      },
    },
  },
});
