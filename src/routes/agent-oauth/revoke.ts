import { createFileRoute } from "@tanstack/react-router";
import { revokeAgentOAuth } from "@/lib/agent-oauth.server";

export const Route = createFileRoute("/agent-oauth/revoke")({
  server: { handlers: { POST: ({ request }) => revokeAgentOAuth(request) } },
});
