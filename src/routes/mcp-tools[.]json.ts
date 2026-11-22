import { createFileRoute } from "@tanstack/react-router";
import { agentToolReference } from "@/lib/agent-api-reference";
import { SITE_URL } from "@/lib/seo-routes";

export const Route = createFileRoute("/mcp-tools.json")({
  server: {
    handlers: {
      GET: () =>
        Response.json(agentToolReference(SITE_URL), {
          headers: { "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
