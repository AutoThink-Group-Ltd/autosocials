import { createFileRoute } from "@tanstack/react-router";
import AgencyActivityPage from "@/pages/agency/AgencyActivityPage";

export const Route = createFileRoute("/agency/activity")({
  component: AgencyActivityPage,
});
