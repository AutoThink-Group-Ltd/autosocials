import { describe, it, expect } from "vitest";
import { parseRichResponse, extractFencedJson, RichResponseSchema } from "../types";

describe("RichResponseSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = parseRichResponse({
      v: 1,
      blocks: [{ type: "text", body: "hello" }],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown block type", () => {
    const r = parseRichResponse({ v: 1, blocks: [{ type: "wat", body: "x" }] });
    expect(r.ok).toBe(false);
  });

  it("rejects wrong version", () => {
    const r = RichResponseSchema.safeParse({ v: 2, blocks: [] });
    expect(r.success).toBe(false);
  });

  it("validates a multi-block payload", () => {
    const r = parseRichResponse({
      v: 1,
      summary: "3 creators found",
      blocks: [
        { type: "heading", level: 2, body: "Top picks" },
        {
          type: "creator_card",
          creator: { handle: "@alice", platform: "tiktok", followers: 12000 },
        },
        {
          type: "actions",
          actions: [
            { label: "Save list", action: "lists.save", variant: "primary", requiresConfirmation: false },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("parses JSON strings", () => {
    const json = JSON.stringify({ v: 1, blocks: [{ type: "divider" }] });
    const r = parseRichResponse(json);
    expect(r.ok).toBe(true);
  });

  it("returns error on invalid JSON", () => {
    const r = parseRichResponse("{not json");
    expect(r.ok).toBe(false);
  });

  it("extracts fenced json block", () => {
    const text = "Here you go:\n```json\n{\"v\":1}\n```\nthanks";
    expect(extractFencedJson(text)).toBe('{"v":1}');
  });

  it("returns null when no fence present", () => {
    expect(extractFencedJson("plain text")).toBeNull();
  });
});