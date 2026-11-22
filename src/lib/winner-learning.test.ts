import { describe, expect, it } from "vitest";
import { loadWinnerLearning } from "./winner-learning.server";

describe("workspace content learning", () => {
  it("supplies only active, fresh findings from the requested workspace", async () => {
    const now = new Date().toISOString();
    const evidence = [{ measured_at: now, analysis_method: "reviewed_v3" }, { measured_at: now, analysis_method: "reviewed_v3" }];
    const rows = [
      { workspace_id: "workspace-a", active: true, dismissed_at: null, updated_at: now, title: "Useful observation", evidence },
      { workspace_id: "workspace-a", active: true, dismissed_at: now, updated_at: now, title: "Dismissed observation", evidence },
      { workspace_id: "workspace-b", active: true, dismissed_at: null, updated_at: now, title: "Other workspace observation", evidence },
      { workspace_id: "workspace-a", active: false, dismissed_at: null, updated_at: now, title: "Inactive observation", evidence },
      { workspace_id: "workspace-a", active: true, dismissed_at: null, updated_at: now, title: "Stale observation", evidence: [{ measured_at: "2020-01-01T00:00:00Z", analysis_method: "reviewed_v3" }, { measured_at: now, analysis_method: "reviewed_v3" }] },
    ];
    const db = { from: () => {
      let filtered = [...rows];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filtered = filtered.filter(row => row[key as keyof typeof row] === value); return query; },
        is: (key: string, value: unknown) => { filtered = filtered.filter(row => row[key as keyof typeof row] === value); return query; },
        gte: () => query,
        order: () => query,
        limit: async () => ({ data: filtered, error: null }),
      };
      return query;
    } };
    const context = await loadWinnerLearning(db as never, "workspace-a");
    expect(context).toContain("Useful observation");
    expect(context).not.toContain("Dismissed observation");
    expect(context).not.toContain("Other workspace observation");
    expect(context).not.toContain("Inactive observation");
    expect(context).not.toContain("Stale observation");
    expect(context).toContain("not brand facts");
  });
});
