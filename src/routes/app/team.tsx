import { createFileRoute } from "@tanstack/react-router";
import TeamManagementPage from "@/pages/app/TeamManagementPage";

export const Route = createFileRoute("/app/team")({
  component: TeamManagementPage,
});
