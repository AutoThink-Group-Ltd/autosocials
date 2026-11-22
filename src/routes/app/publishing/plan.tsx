import { createFileRoute } from "@tanstack/react-router";
import PublishingPlanWeekPage from "@/pages/app/PublishingPlanWeekPage";

export const Route = createFileRoute("/app/publishing/plan")({
  component: PublishingPlanWeekPage,
});
