import { createFileRoute } from "@tanstack/react-router";

// Sam's streaming chat. Caller is verified inside the handler (bearer token + workspace access).
export const Route = createFileRoute("/api/sam/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSamChat } = await import("@/lib/sam.chat.server");
        try {
          return await handleSamChat(request);
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error(e);
          return new Response(JSON.stringify({ error: "Sam couldn't respond." }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
