import { describe, it, expect, vi } from "vitest";
import { handleCreativeJobRequest } from "@/lib/creative-jobs.server";

describe("production cron authorization", () => {
  const secret = "a".repeat(64);
  const request = (value?: string, method = "POST") => new Request("https://www.autosocials.com/api/public/creative-jobs", { method, ...(value ? { headers: { "x-creative-secret": value } } : {}) });
  it("does not read credentials or advance jobs for an unauthenticated call", async () => {
    const deps = { readSecret: vi.fn(), run: vi.fn() };
    expect((await handleCreativeJobRequest(request(), deps)).status).toBe(401);
    expect((await handleCreativeJobRequest(request(secret, "GET"), deps)).status).toBe(405);
    expect(deps.readSecret).not.toHaveBeenCalled(); expect(deps.run).not.toHaveBeenCalled();
  });
  it("rejects wrong/missing credentials without work", async () => {
    const deps = { readSecret: vi.fn().mockResolvedValue(secret), run: vi.fn() };
    expect((await handleCreativeJobRequest(request("b".repeat(64)), deps)).status).toBe(401);
    deps.readSecret.mockResolvedValue(null);
    expect((await handleCreativeJobRequest(request(secret), deps)).status).toBe(401);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("advances only after a valid secret and masks internal failures", async () => {
    const deps = { readSecret: vi.fn().mockResolvedValue(secret), run: vi.fn().mockResolvedValue({ updated: 2 }) };
    expect(await (await handleCreativeJobRequest(request(secret), deps)).json()).toEqual({ updated: 2 });
    expect(deps.run).toHaveBeenCalledTimes(1);
    deps.run.mockRejectedValue(new Error("sensitive internal details"));
    const result = await handleCreativeJobRequest(request(secret), deps);
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("sensitive");
  });
});
