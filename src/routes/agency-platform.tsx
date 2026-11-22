import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import AgencyPlatformPage from "@/pages/AgencyPlatformPage";

export const Route = createFileRoute("/agency-platform")({
  head: () => seoHead("/agency-platform"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <AgencyPlatformPage />
    </>
  ),
});
