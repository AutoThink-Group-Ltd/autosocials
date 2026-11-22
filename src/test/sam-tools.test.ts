import { describe, it, expect } from "vitest";
import { SAM_TOOLS, checkBriefPatch, dedupeById, isGatedAction } from "@/lib/sam.tools";
import { listToolNames } from "../../tools/registry";

const own = new Set(["f1", "f2"]);

describe("Sam chat tools", () => {
  it("only the approval tool needs confirmation; no tool renders, publishes, sends or deletes directly", () => {
    expect(Object.entries(SAM_TOOLS).filter(([, t]) => t.confirm).map(([n]) => n)).toEqual(["request_approval"]);
    for (const n of Object.keys(SAM_TOOLS)) expect(n).not.toMatch(/render|publish|send|delete|share|schedule/);
  });
  it("render, publish and delete are gated actions", () => {
    for (const a of ["render_variants", "publish", "delete", "send", "share"]) expect(isGatedAction(a)).toBe(true);
  });
  it("every Sam tool is registered", () => {
    for (const n of Object.keys(SAM_TOOLS)) expect(listToolNames()).toContain(`sam.${n}`);
  });
  it("approved assets can't be edited", () => {
    expect(checkBriefPatch("approved", { hook: "x" }, own).ok).toBe(false);
  });
  it("length must be 15 or 30 seconds", () => {
    expect(checkBriefPatch("draft", { duration_s: 20 }, own).ok).toBe(false);
    expect(checkBriefPatch("draft", { duration_s: 15 }, own).ok).toBe(true);
  });
  it("files from another business are refused", () => {
    expect(checkBriefPatch("draft", { file_ids: ["f1", "other"] }, own).ok).toBe(false);
    expect(checkBriefPatch("draft", { file_ids: ["f1"] }, own).ok).toBe(true);
  });
  it("duplicate replies are shown once", () => {
    expect(dedupeById([{ id: "a" }, { id: "a" }, { id: "b" }]).map((m) => m.id)).toEqual(["a", "b"]);
  });
});
