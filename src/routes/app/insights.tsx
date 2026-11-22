import { createFileRoute } from "@tanstack/react-router";
import InsightsPage from "@/pages/app/InsightsPage";

export const Route = createFileRoute("/app/insights")({
  component: InsightsPage,
});
