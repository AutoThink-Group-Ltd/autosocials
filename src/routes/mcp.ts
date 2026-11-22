import { createFileRoute } from "@tanstack/react-router";
import { agentMcp } from "@/lib/agent-api.server";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => agentMcp(request),
      GET: ({ request }) => agentMcp(request),
      DELETE: ({ request }) => agentMcp(request),
    },
  },
});
