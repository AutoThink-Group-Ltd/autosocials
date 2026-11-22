import { describe, expect, it, vi } from "vitest";
import { handleScheduleConfirmations } from "./schedule-confirmations";

describe("schedule confirmation worker", () => {
  const secret = "a".repeat(64);
  it("rejects unauthenticated and incorrect requests before draining", async () => {
    const deps = { readSecret: vi.fn().mockResolvedValue(secret), drain: vi.fn() };
    expect((await handleScheduleConfirmations(new Request("https://example.test", { method: "POST" }), deps)).status).toBe(401);
    expect((await handleScheduleConfirmations(new Request("https://example.test", { method: "POST", headers: { "x-schedule-confirmation-secret": "b".repeat(64) } }), deps)).status).toBe(401);
    expect(deps.drain).not.toHaveBeenCalled();
  });
  it("runs the outbox only for authenticated POST and reports failures without leaking details", async () => {
    const deps = { readSecret: vi.fn().mockResolvedValue(secret), drain: vi.fn().mockResolvedValue(undefined) };
    const request = () => new Request("https://example.test", { method: "POST", headers: { "x-schedule-confirmation-secret": secret } });
    expect((await handleScheduleConfirmations(request(), deps)).status).toBe(200);
    expect(deps.drain).toHaveBeenCalledOnce();
    deps.drain.mockRejectedValueOnce(new Error("private provider error"));
    const response = await handleScheduleConfirmations(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider error");
    expect((await handleScheduleConfirmations(new Request("https://example.test"), deps)).status).toBe(405);
  });
});
