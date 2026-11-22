import { createFileRoute } from "@tanstack/react-router";
import { publicFacts } from "@/lib/public-facts";

// Public, read-only brand facts for AI answer engines. Static data only; no customer records.
export const Route = createFileRoute("/api/public/facts")({
  server: {
    handlers: {
      GET: async () => Response.json(publicFacts(), { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } }),
    },
  },
});
