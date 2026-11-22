import { describe, it, expect } from "vitest";
import { parsePartialRich } from "../streaming";

const open = "```vibe-rich\n";
const close = "\n```";

describe("parsePartialRich", () => {
  it("returns detected=false when no fence is present", () => {
    const r = parsePartialRich("hello world");
    expect(r.detected).toBe(false);
    expect(r.response).toBeNull();
  });

  it("parses a fully closed valid envelope", () => {
    const env = JSON.stringify({
      v: 1,
      blocks: [{ type: "text", body: "hi" }],
    });
    const r = parsePartialRich(open + env + close);
    expect(r.complete).toBe(true);
    expect(r.response?.blocks).toHaveLength(1);
  });

  it("renders complete blocks while the tail is still streaming", () => {
    const partial =
      open +
      '{"v":1,"blocks":[{"type":"text","body":"first"},{"type":"heading","level":2,"body":"second"},{"type":"list","items":["a"';
    const r = parsePartialRich(partial);
    expect(r.detected).toBe(true);
    expect(r.complete).toBe(false);
    expect(r.response?.blocks.length).toBeGreaterThanOrEqual(2);
    // The trailing in-progress list should be dropped.
    expect(r.response?.blocks.every((b) => b.type !== "list" || (b as any).items?.length)).toBe(true);
  });

  it("returns null response when nothing has parsed yet", () => {
    const r = parsePartialRich(open + '{"v":1,"bloc');
    expect(r.detected).toBe(true);
    expect(r.response).toBeNull();
  });
});