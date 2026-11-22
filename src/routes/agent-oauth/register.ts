import { createFileRoute } from "@tanstack/react-router";
import { registerOAuthClient } from "@/lib/agent-oauth.server";

export const Route = createFileRoute("/agent-oauth/register")({
  server: { handlers: { POST: ({ request }) => registerOAuthClient(request) } },
});
