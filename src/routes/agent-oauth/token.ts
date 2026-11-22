import { createFileRoute } from "@tanstack/react-router";
import { exchangeAgentOAuthToken } from "@/lib/agent-oauth.server";

export const Route = createFileRoute("/agent-oauth/token")({
  server: {
    handlers: { POST: ({ request }) => exchangeAgentOAuthToken(request) },
  },
});
