import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/creative-jobs")({
  server: { handlers: { POST: async ({ request }) => (await import("@/lib/creative-jobs.server")).handleCreativeJobRequest(request) } },
});
