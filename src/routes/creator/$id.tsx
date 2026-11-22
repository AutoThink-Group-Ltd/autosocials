import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import PublicCreatorProfilePage from "@/pages/PublicCreatorProfilePage";

export const Route = createFileRoute("/creator/$id")({
  component: () => (
    <>
      <PublicTrackingWrapper />
      <PublicCreatorProfilePage />
    </>
  ),
});
