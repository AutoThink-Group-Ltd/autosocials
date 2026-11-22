import { createFileRoute } from "@tanstack/react-router";
import { oauthMetadata } from "@/lib/agent-oauth.server";

export const Route = createFileRoute("/.well-known/oauth-authorization-server")(
  {
    server: { handlers: { GET: ({ request }) => oauthMetadata(request) } },
  },
);
