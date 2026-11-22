import { describe, expect, it } from "vitest";
import { mergeSocialTileHistory } from "./social-tile-history";

describe("social tile history", () => {
  it("includes unlinked saved tiles without inventing their provider and avoids duplicating linked files", () => {
    const files = [{ id: "one", workspace_id: "a", name: "linked.png", created_at: "2026-11-01" }, { id: "two", workspace_id: "a", name: "direct.png", created_at: "2026-11-03" }];
    const operations = [{ workspace_id: "a", signature: "request", status: "complete", created_at: "2026-11-02", result: { file_id: "one", provider: "recraft", credits: 35 } }];
    const rows = mergeSocialTileHistory(operations, files);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fileId: "two", provider: "Unknown", status: "saved" });
    expect(rows[1]).toMatchObject({ fileId: "one", title: "linked.png", provider: "recraft", credits: 35 });
  });
  it("does not attach a file from a different workspace and retains failed requests", () => {
    const rows = mergeSocialTileHistory([{ workspace_id: "a", signature: "request", status: "failed", created_at: "2026-11-02", result: { file_id: "one" } }], [{ id: "one", workspace_id: "b", name: "other.png", created_at: "2026-11-01" }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fileId: null, status: "failed" });
    expect(rows[1]).toMatchObject({ fileId: "one", status: "saved" });
  });
});
