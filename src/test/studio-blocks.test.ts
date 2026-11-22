import { describe, it, expect } from "vitest";
import { decideConfirm, keepOwnFiles, parseBlocks, type Block } from "@/lib/sam.blocks";

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", X = "99999999-9999-9999-9999-999999999999";

describe("studio blocks", () => {
  it("accepts the new studio block types", () => {
    const b = parseBlocks([{ type: "assets", title: "Picks", file_ids: [A] }, { type: "palette", title: "Colours", colours: [{ hex: "#111111" }] }, { type: "bogus" }]);
    expect(b.map((x) => x.type)).toEqual(["assets", "palette"]);
  });
  it("strips files from other businesses", () => {
    const out = keepOwnFiles([
      { type: "assets", title: "t", file_ids: [A, X] },
      { type: "compare", title: "c", left_file_id: A, right_file_id: X },
      { type: "shotlist", title: "s", items: [{ file_id: X, role: "hook", why: "" }] },
    ], new Set([A, B]));
    expect(out).toEqual([{ type: "assets", title: "t", file_ids: [A] }]);
  });
  it("Sam can never pre-approve a confirm card", () => {
    const out = keepOwnFiles([{ type: "confirm", title: "Render", action: "render_variants", fields: [], status: "approved" }], new Set());
    expect((out[0] as Extract<Block, { type: "confirm" }>).status).toBe("pending");
  });
  it("a decided card cannot be decided again", () => {
    const blocks: Block[] = [{ type: "confirm", title: "Render", action: "render_variants", fields: [], status: "pending" }];
    const once = decideConfirm(blocks, 0, "approved");
    expect(() => decideConfirm(once, 0, "cancelled")).toThrow();
  });
});
