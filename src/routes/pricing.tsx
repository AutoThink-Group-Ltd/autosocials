import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import PricingPage from "@/pages/PricingPage";

export const Route = createFileRoute("/pricing")({
  head: () => seoHead("/pricing"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <PricingPage />
    </>
  ),
});
