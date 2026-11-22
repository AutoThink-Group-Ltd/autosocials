import { createFileRoute } from "@tanstack/react-router";
import AgencyClientsPage from "@/pages/agency/AgencyClientsPage";

export const Route = createFileRoute("/agency/clients")({
  component: AgencyClientsPage,
});
