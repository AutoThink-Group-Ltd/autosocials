import { createFileRoute } from "@tanstack/react-router";
import AgencyReportsPage from "@/pages/agency/AgencyReportsPage";

export const Route = createFileRoute("/agency/reports")({
  component: AgencyReportsPage,
});
