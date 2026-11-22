import { describe, it, expect, vi } from "vitest";
import { searchShortFormTrends } from "./agent-virlo.server";
const workspaceId = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333",
  resultId = "44444444-4444-4444-8444-444444444444";
const request = {
  workspaceId,
  userId,
  requestId,
  input: { query: "coffee", allowMeteredSearch: true },
};
function setup() {
  const execute = vi.fn(async () => ({
    id: resultId,
    data: {
      videos: [
        {
          id: "private-provider-id",
          url: "https://www.instagram.com/reel/abc/?tracking=private",
          caption: "hello",
          views: 12,
          thumbnail_url: "https://private.invalid/secret",
        },
        { url: "https://facebook.com/ads/library/id", caption: "advert" },
        { url: "https://evil.example/reel/a" },
      ],
    },
  }));
  return { access: vi.fn(async () => true), available: () => true, execute };
}
describe("agent organic trend search", () => {
  it("requires explicit metered consent, workspace access and operator availability before search", async () => {
    const d = setup();
    await expect(
      searchShortFormTrends({ ...request, input: { query: "coffee" } }, d),
    ).rejects.toThrow();
    await expect(
      searchShortFormTrends(request, { ...d, access: async () => false }),
    ).rejects.toThrow("Workspace access denied");
    await expect(
      searchShortFormTrends(request, { ...d, available: () => false }),
    ).rejects.toThrow("unavailable");
    expect(d.execute).not.toHaveBeenCalled();
  });
  it("uses only organic operation and returns sanitized bounded data", async () => {
    const d = setup();
    const result = await searchShortFormTrends(request, d);
    expect(d.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: workspaceId,
        request_id: requestId,
        operation: expect.objectContaining({
          operation: "videos",
          scope: "virlo_library",
          query: "coffee",
        }),
      }),
      userId,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      platform: "instagram",
      url: "https://www.instagram.com/reel/abc/",
      views: 12,
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("advert");
  });
});
