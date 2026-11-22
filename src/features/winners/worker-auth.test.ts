import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isWinnerWorker } from "../../../supabase/functions/_shared/winner-worker-auth";

afterEach(() => vi.unstubAllGlobals());
describe("winner scheduler authentication", () => {
  it("accepts only the stored secret and fails closed on database errors", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const secret = "a".repeat(64);
    const result = { data: { secret }, error: null as unknown };
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) };
    const request = (value: string) => new Request("https://example.com", { headers: { "x-winner-job-secret": value } });
    expect(await isWinnerWorker(request(secret), db)).toBe(true);
    expect(await isWinnerWorker(request("b".repeat(64)), db)).toBe(false);
    result.error = new Error("database unavailable");
    expect(await isWinnerWorker(request(secret), db)).toBe(false);
  });
});
