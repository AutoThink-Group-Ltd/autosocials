import { createFileRoute } from "@tanstack/react-router";
import { AgentAccessSettingsPage } from "@/features/agent-access/AgentAccessSettingsPage";
export const Route = createFileRoute("/app/settings/agent-access")({
  component: AgentAccessSettingsPage,
});
