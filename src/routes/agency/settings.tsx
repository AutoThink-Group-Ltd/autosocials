import { createFileRoute } from "@tanstack/react-router";
import AgencySettingsPage from "@/pages/agency/AgencySettingsPage";

export const Route = createFileRoute("/agency/settings")({
  component: AgencySettingsPage,
});
