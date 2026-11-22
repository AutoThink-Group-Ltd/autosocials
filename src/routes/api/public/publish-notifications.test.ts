import { describe, expect, it, vi } from "vitest";
import { handlePublishNotifications } from "./publish-notifications";

describe("publishing notification scheduler endpoint", () => {
  it("only drains for the trusted scheduler and hides errors", async () => {
    const secret = "a".repeat(64);
    const deps = { readSecret: vi.fn().mockResolvedValue(secret), drain: vi.fn().mockResolvedValue(undefined) };
    const request = (value?: string) => new Request("https://example.test", { method: "POST", headers: value ? { "x-publish-notification-secret": value } : {} });
    expect((await handlePublishNotifications(request(), deps)).status).toBe(401);
    expect((await handlePublishNotifications(request("b".repeat(64)), deps)).status).toBe(401);
    expect(deps.drain).not.toHaveBeenCalled();
    expect((await handlePublishNotifications(request(secret), deps)).status).toBe(200);
    deps.drain.mockRejectedValueOnce(new Error("private data"));
    const response = await handlePublishNotifications(request(secret), deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private data");
    expect((await handlePublishNotifications(new Request("https://example.test"), deps)).status).toBe(405);
  });
});
