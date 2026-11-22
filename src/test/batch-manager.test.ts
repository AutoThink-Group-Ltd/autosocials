import { describe, it, expect } from "vitest";
import { bulkDeleteAllowed, MAX_BULK_BATCH_DELETE } from "@/lib/wizard";

const mine = (ws: string) => ws === "ws-mine";
describe("bulk batch delete", () => {
  it("allows deleting batches all in my workspace", () => {
    expect(bulkDeleteAllowed(["a", "b"], [{ id: "a", workspace_id: "ws-mine" }, { id: "b", workspace_id: "ws-mine" }], mine)).toBe(true);
  });
  it("rejects the whole request if one batch is from another workspace", () => {
    expect(bulkDeleteAllowed(["a", "b"], [{ id: "a", workspace_id: "ws-mine" }, { id: "b", workspace_id: "ws-other" }], mine)).toBe(false);
  });
  it("rejects ids that don't exist", () => {
    expect(bulkDeleteAllowed(["a", "ghost"], [{ id: "a", workspace_id: "ws-mine" }], mine)).toBe(false);
  });
  it("caps a request at 50 batches", () => {
    const ids = Array.from({ length: MAX_BULK_BATCH_DELETE + 1 }, (_, i) => `b${i}`);
    expect(bulkDeleteAllowed(ids, ids.map((id) => ({ id, workspace_id: "ws-mine" })), mine)).toBe(false);
  });
});
