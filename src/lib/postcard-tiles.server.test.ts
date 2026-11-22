import { describe, expect, it, vi } from "vitest";
import { PostcardClient } from "./postcard-tiles.server";
const response = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers });
describe("Postcards MCP client", () => {
  it("initializes and reads structured tool responses without exposing credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          { jsonrpc: "2.0", id: 1, result: { capabilities: {} } },
          { "mcp-session-id": "session" },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        response({
          jsonrpc: "2.0",
          id: 2,
          result: { structuredContent: { project: { id: "123" } } },
        }),
      );
    const client = new PostcardClient("secret-value", fetcher);
    await client.init();
    const result = await client.call("postcards_ai_generate_template", {
      prompt: "example",
    });
    expect(result.project?.id).toBe("123");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]![1].redirect).toBe("error");
  });
  it("does not surface provider response text on failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("secret-value", { status: 401 }));
    await expect(
      new PostcardClient("secret-value", fetcher).init(),
    ).rejects.toThrow("could not be completed");
  });
});
