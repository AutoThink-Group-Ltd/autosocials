import { createFileRoute } from "@tanstack/react-router";
import AgencyNotificationsPage from "@/pages/agency/AgencyNotificationsPage";

export const Route = createFileRoute("/agency/notifications")({
  component: AgencyNotificationsPage,
});
