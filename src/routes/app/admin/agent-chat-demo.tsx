import { createFileRoute } from "@tanstack/react-router";
import AgentChatDemoPage from "@/pages/app/AgentChatDemoPage";

export const Route = createFileRoute("/app/admin/agent-chat-demo")({
  component: AgentChatDemoPage,
});
