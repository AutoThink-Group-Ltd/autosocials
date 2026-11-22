import { createFileRoute } from "@tanstack/react-router";
import AgentTracesPage from "@/pages/app/AgentTracesPage";

export const Route = createFileRoute("/app/admin/traces")({
  component: AgentTracesPage,
});
