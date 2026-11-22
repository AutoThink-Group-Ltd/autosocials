import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import AgentAccessOverview from "@/features/admin/AgentAccessOverview";

export const Route = createFileRoute("/app/admin/agent-access")({
  component: () => (
    <SuperAdminRoute>
      <AgentAccessOverview />
    </SuperAdminRoute>
  ),
});
