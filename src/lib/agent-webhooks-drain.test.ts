import { describe, it, expect, vi } from "vitest";
import { handleAgentWebhookDrain } from "../routes/api/public/agent-webhook-drain";
const secret = "a".repeat(64);
const req = (s = secret) =>
  new Request("https://example.invalid/api/public/agent-webhook-drain", {
    method: "POST",
    headers: { "x-agent-webhook-job-secret": s },
  });
describe("webhook drain endpoint", () => {
  it("is default disabled and requires the correct job secret", async () => {
    const drain = vi.fn(async () => ({ processed: true }));
    const deps = {
      enabled: () => false,
      readSecret: async () => secret,
      drain,
    };
    expect((await handleAgentWebhookDrain(req(), deps)).status).toBe(503);
    expect(drain).not.toHaveBeenCalled();
    expect(
      (
        await handleAgentWebhookDrain(req("b".repeat(64)), {
          ...deps,
          enabled: () => true,
        })
      ).status,
    ).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });
  it("drains no more than two deliveries and hides internal errors", async () => {
    const drain = vi.fn(async () => ({ processed: true }));
    const deps = { enabled: () => true, readSecret: async () => secret, drain };
    const response = await handleAgentWebhookDrain(req(), deps);
    expect(response.status).toBe(200);
    expect(drain).toHaveBeenCalledTimes(2);
    expect(
      (
        await handleAgentWebhookDrain(req(), {
          ...deps,
          drain: async () => {
            throw Error("private");
          },
        })
      ).status,
    ).toBe(503);
  });
});
