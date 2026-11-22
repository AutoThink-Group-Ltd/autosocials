import { createFileRoute } from "@tanstack/react-router";
import SocialConnectionsPage from "@/pages/app/SocialConnectionsPage";

export const Route = createFileRoute("/app/settings/connections")({
  component: SocialConnectionsPage,
});
