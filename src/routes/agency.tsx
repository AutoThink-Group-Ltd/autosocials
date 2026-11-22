import { createFileRoute } from "@tanstack/react-router";
import AgencyProtectedRoute from "@/components/app/AgencyProtectedRoute";
import AgencyLayout from "@/features/agency/AgencyShell";

export const Route = createFileRoute("/agency")({
  component: () => (
    <AgencyProtectedRoute>
      <AgencyLayout />
    </AgencyProtectedRoute>
  ),
});
