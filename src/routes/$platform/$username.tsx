import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import SEOCreatorProfilePage from "@/pages/SEOCreatorProfilePage";

export const Route = createFileRoute("/$platform/$username")({
  component: () => (
    <>
      <PublicTrackingWrapper />
      <SEOCreatorProfilePage />
    </>
  ),
});
