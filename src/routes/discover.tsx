import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import PublicDiscoverPage from "@/pages/PublicDiscoverPage";

export const Route = createFileRoute("/discover")({
  head: () => seoHead("/discover"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <PublicDiscoverPage />
    </>
  ),
});
