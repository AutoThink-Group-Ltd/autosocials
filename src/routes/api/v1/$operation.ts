import { createFileRoute } from "@tanstack/react-router";
import { agentRest } from "@/lib/agent-api.server";

export const Route = createFileRoute("/api/v1/$operation")({
  server: {
    handlers: {
      GET: ({ request, params }) => agentRest(request, params.operation),
      POST: ({ request, params }) => agentRest(request, params.operation),
    },
  },
});
