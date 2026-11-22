import { describe, expect, it } from "vitest";
import { personalLeaseIsActive, personalSourceIsCurrent, PERSONAL_LEASE_MS } from "./personal-brand-lease";
describe("personal review lease", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  it("does not reclaim active workers but allows interrupted workers to be replaced", () => {
    expect(personalLeaseIsActive("running", new Date(now - PERSONAL_LEASE_MS + 1).toISOString(), now)).toBe(true);
    expect(personalLeaseIsActive("running", new Date(now - PERSONAL_LEASE_MS).toISOString(), now)).toBe(false);
    expect(personalLeaseIsActive("failed", new Date(now).toISOString(), now)).toBe(false);
  });
  it("refuses to publish when a source has changed or is refreshing", () => {
    expect(personalSourceIsCurrent("one", "one", "complete")).toBe(true);
    expect(personalSourceIsCurrent("one", "two", "complete")).toBe(false);
    expect(personalSourceIsCurrent("one", "one", "running")).toBe(false);
  });
});
import { commitPersonalLease } from "./personal-brand-lease";
it("fences stale workers while preserving the last successful result", async () => {
  let row: Record<string, any> = { workspace_id: "w", kind: "personal-discovery", signature: "v1", token: "old", status: "running", result: { content: "last" } };
  const db = { from: () => ({ update: (patch: Record<string, unknown>) => {
    const checks: Record<string, unknown> = {};
    const chain = { match: (key: Record<string, unknown>) => { Object.assign(checks, key); return chain; }, eq: (key: string, value: unknown) => { checks[key] = value; return chain; }, select: () => chain, maybeSingle: async () => {
      if (!Object.entries(checks).every(([key, value]) => row[key] === value)) return { data: null, error: null };
      row = { ...row, ...patch }; return { data: { token: row["token"] }, error: null };
    } }; return chain;
  } }) };
  const key = { workspace_id: "w", kind: "personal-discovery", signature: "v1" };
  row = { ...row, token: "new", status: "running" };
  expect(await commitPersonalLease(db, key, "old", { content: "stale" })).toBe(false);
  expect(row["result"]).toEqual({ content: "last" });
  expect(await commitPersonalLease(db, key, "new", { content: "fresh" })).toBe(true);
  expect(row["result"]).toEqual({ content: "fresh" });
});
