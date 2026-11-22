import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockRenderer } from "../BlockRenderer";
import { parseRichResponse } from "../types";

const fixture = {
  v: 1 as const,
  summary: "Demo of every block",
  blocks: [
    { type: "heading", level: 2, body: "Top creators" },
    { type: "text", body: "Hello world", tone: "neutral" },
    { type: "list", ordered: false, items: ["one", "two"] },
    { type: "key_value", title: "Brief", pairs: [{ label: "Niche", value: "Beauty" }] },
    { type: "stat", stats: [{ label: "Sent", value: "120", delta: "+12", trend: "up" }] },
    {
      type: "chart", chart: "bar", title: "Sends", xKey: "day", series: ["sent"],
      data: [{ day: "Mon", sent: 10 }, { day: "Tue", sent: 14 }],
    },
    {
      type: "table", title: "Picks",
      columns: [{ key: "h", label: "Handle" }, { key: "f", label: "Followers" }],
      rows: [{ h: "@a", f: 1000 }],
    },
    { type: "creator_card", creator: { handle: "@alice", platform: "tiktok", followers: 12000 } },
    { type: "message_preview", channel: "instagram_dm", to: { handle: "@alice" }, body: "hey!" },
    { type: "callout", intent: "warning", title: "Heads up", body: "Confirm before sending." },
    { type: "divider" },
    {
      type: "actions",
      actions: [{ label: "Send", action: "outreach.send", variant: "primary", requiresConfirmation: true }],
    },
  ],
};

describe("BlockRenderer", () => {
  it("renders every supported block type without crashing", () => {
    const parsed = parseRichResponse(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    render(<BlockRenderer response={parsed.response} />);
    expect(screen.getByText("Top creators")).toBeDefined();
    expect(screen.getByText("Hello world")).toBeDefined();
    expect(screen.getAllByText(/@alice/).length).toBeGreaterThan(0);
    expect(screen.getByText("Heads up")).toBeDefined();
    expect(screen.getByRole("button", { name: /Send/i })).toBeDefined();
  });

  it("forwards action clicks to onAction handler", () => {
    const parsed = parseRichResponse(fixture);
    if (!parsed.ok) throw new Error("fixture invalid");
    const onAction = vi.fn();
    render(<BlockRenderer response={parsed.response} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0].action).toBe("outreach.send");
  });
});