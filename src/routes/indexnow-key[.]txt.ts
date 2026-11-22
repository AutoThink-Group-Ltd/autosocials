import { createFileRoute } from "@tanstack/react-router";

// IndexNow key file (public by protocol). Must match INDEXNOW_KEY in seo-audit.server.ts.
export const Route = createFileRoute("/indexnow-key.txt")({
  server: { handlers: { GET: async () => new Response("a7c3e91f5b2d48e6b0f4c8d29e1a6b37", { headers: { "Content-Type": "text/plain; charset=utf-8" } }) } },
});
