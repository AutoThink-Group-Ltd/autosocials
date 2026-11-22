import { createFileRoute } from "@tanstack/react-router";
import { protectedResourceMetadata } from "@/lib/agent-oauth.server";

export const Route = createFileRoute(
  "/.well-known/oauth-protected-resource/mcp",
)({
  server: {
    handlers: { GET: ({ request }) => protectedResourceMetadata(request) },
  },
});
