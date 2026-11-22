import { createFileRoute } from "@tanstack/react-router";
import AgencyRevenuePage from "@/pages/agency/AgencyRevenuePage";

export const Route = createFileRoute("/agency/revenue")({
  component: AgencyRevenuePage,
});
