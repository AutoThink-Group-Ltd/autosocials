import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import RoadmapPage from "@/pages/app/RoadmapPage";

export const Route = createFileRoute("/app/admin/roadmap")({
  component: () => <SuperAdminRoute><RoadmapPage /></SuperAdminRoute>,
});
