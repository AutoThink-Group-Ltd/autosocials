import { createFileRoute } from "@tanstack/react-router";
import AgentApprovalsPage from "@/pages/app/AgentApprovalsPage";

export const Route = createFileRoute("/app/admin/approvals")({
  component: AgentApprovalsPage,
});
