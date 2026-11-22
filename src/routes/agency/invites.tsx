import { createFileRoute } from "@tanstack/react-router";
import AgencyInvitesPage from "@/pages/agency/AgencyInvitesPage";

export const Route = createFileRoute("/agency/invites")({
  component: AgencyInvitesPage,
});
