import { describe, it, expect } from "vitest";
import { summarizeClient } from "@/lib/client-status";

const p = (status: string, scheduled_at: string | null = null, published_at: string | null = null) => ({ status, scheduled_at, published_at });

describe("summarizeClient", () => {
  it("no posts means no content", () => expect(summarizeClient([]).status).toBe("empty"));
  it("failed beats everything else", () =>
    expect(summarizeClient([p("scheduled", "2026-11-01"), p("failed"), p("awaiting_approval")]).status).toBe("attention"));
  it("awaiting approval beats scheduled", () =>
    expect(summarizeClient([p("scheduled", "2026-11-01"), p("awaiting_approval")]).status).toBe("approval"));
  it("scheduled reports count and earliest time", () => {
    const s = summarizeClient([p("scheduled", "2026-11-03"), p("scheduled", "2026-11-01"), p("draft")]);
    expect(s.status).toBe("scheduled");
    expect(s.scheduled).toBe(2);
    expect(s.nextScheduledAt).toBe("2026-11-01");
  });
  it("drafts only", () => expect(summarizeClient([p("draft")]).status).toBe("drafts"));
  it("inactive link is disconnected", () => expect(summarizeClient([p("draft")], false).status).toBe("disconnected"));
});
