import { createFileRoute } from "@tanstack/react-router";
import PublicAgencyReportPage from "@/pages/PublicAgencyReportPage";

export const Route = createFileRoute("/agency-report/$token")({
  component: PublicAgencyReportPage,
});
