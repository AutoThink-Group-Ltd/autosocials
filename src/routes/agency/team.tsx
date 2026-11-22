import { createFileRoute } from "@tanstack/react-router";
import AgencyTeamPage from "@/pages/agency/AgencyTeamPage";

export const Route = createFileRoute("/agency/team")({
  component: AgencyTeamPage,
});
