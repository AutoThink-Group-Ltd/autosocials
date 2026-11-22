import { createFileRoute } from "@tanstack/react-router";
import CommissionsPage from "@/pages/app/CommissionsPage";

export const Route = createFileRoute("/app/commissions")({
  component: CommissionsPage,
});
