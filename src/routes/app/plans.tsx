import { createFileRoute } from "@tanstack/react-router";
import PlansPage from "@/pages/app/PlansPage";

export const Route = createFileRoute("/app/plans")({
  component: PlansPage,
});
