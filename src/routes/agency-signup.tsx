import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import AgencySignupDirectPage from "@/pages/AgencySignupDirectPage";

export const Route = createFileRoute("/agency-signup")({
  head: () => seoHead("/agency-signup"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <AgencySignupDirectPage />
    </>
  ),
});
