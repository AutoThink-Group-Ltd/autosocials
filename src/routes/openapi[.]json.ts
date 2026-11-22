import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-routes";
import { agentApiPaths } from "@/lib/agent-api-reference";

export const Route = createFileRoute("/openapi.json")({
  server: {
    handlers: {
      GET: async () => Response.json({
        openapi: "3.1.0",
        info: { title: "AutoSocials API", version: "1.1.0", description: "Read-only public facts and the gated developer API pilot." },
        servers: [{ url: SITE_URL }],
        components: { securitySchemes: { AgentApiKey: { type: "http", scheme: "bearer", description: "A scoped AutoSocials workspace API key" } } },
        paths: {
          ...agentApiPaths(),
          "/api/public/facts": {
            get: {
              operationId: "getFacts", summary: "AutoSocials product facts, plans and links",
              responses: { "200": { description: "Facts", content: { "application/json": { schema: { type: "object", properties: {
                name: { type: "string" }, url: { type: "string" }, summary: { type: "string" }, stages: { type: "array", items: { type: "string" } },
                platforms: { type: "array", items: { type: "string" } }, plans: { type: "array", items: { type: "object", properties: { name: { type: "string" }, currency: { type: "string" }, monthly: { type: "number" }, monthlyCredits: { type: "number" } } } },
              } } } } } },
            },
          },
        },
      }, { headers: { "Cache-Control": "public, max-age=86400" } }),
    },
  },
});
