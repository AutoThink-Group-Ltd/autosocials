import { createFileRoute } from "@tanstack/react-router";
import CreatorProfilePage from "@/pages/app/CreatorProfilePage";

export const Route = createFileRoute("/app/creator/$id")({
  component: CreatorProfilePage,
});
