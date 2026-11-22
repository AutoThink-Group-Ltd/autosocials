import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import PublicReferralPage from "@/pages/PublicReferralPage";

export const Route = createFileRoute("/partner/$code/")({
  component: () => (
    <>
      <PublicTrackingWrapper />
      <PublicReferralPage />
    </>
  ),
});
