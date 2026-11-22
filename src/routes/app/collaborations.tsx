import { createFileRoute } from "@tanstack/react-router";
import CollaborationsPage from "@/pages/app/CollaborationsPage";

export const Route = createFileRoute("/app/collaborations")({
  component: CollaborationsPage,
});
