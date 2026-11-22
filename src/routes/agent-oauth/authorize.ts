import { createFileRoute } from "@tanstack/react-router";
import { startAgentOAuth } from "@/lib/agent-oauth.server";

export const Route = createFileRoute("/agent-oauth/authorize")({
  server: { handlers: { GET: ({ request }) => startAgentOAuth(request) } },
});
