import { describe, it, expect } from "vitest";
import { diffSnapshots, buildSubject, buildPreview, summaryCase, ukDates, renderDigest, EMPTY_DIFF, type IntentSnap } from "@/lib/gsc-digest";

const s = (name: string, impr: number, clicks = 0): IntentSnap => ({
  intent_name: name, description: "d", queries: ["q1", "q2", "q3", "q4"], total_impressions: impr, total_clicks: clicks, avg_position: 5,
});

describe("gsc digest", () => {
  it("formats UK dates", () => {
    expect(ukDates("2026-10-17")).toMatchObject({ short: "17/10/26", long: "Saturday 17 October 2026" });
  });

  it("new = missing the day before; growing = impressions up, sorted by increase", () => {
    const d = diffSnapshots([s("A", 10), s("B", 50), s("C", 30), s("D", 5)], [s("B", 40), s("C", 10), s("D", 9)]);
    expect(d.newIntents.map((i) => i.intent_name)).toEqual(["A"]);
    expect(d.growing.map((g) => g.intent_name)).toEqual(["C", "B"]);
    expect(d.growing[0]!.delta_impressions).toBe(20);
  });

  it("keeps only the top 10 growing", () => {
    const cur = Array.from({ length: 15 }, (_, i) => s(`I${i}`, 100 + i));
    const prev = Array.from({ length: 15 }, (_, i) => s(`I${i}`, 100));
    expect(diffSnapshots(cur, prev).growing).toHaveLength(10);
  });

  it("subject carries the brand so it never threads with other apps' digests", () => {
    const withNew = diffSnapshots([s("A", 1), s("B", 5)], [s("B", 2)]);
    expect(buildSubject("2026-10-17", withNew)).toBe("GSC Intent · AutoSocials · 17/10/26 · 1 new intent (Saturday 17 October 2026)");
    expect(buildPreview("2026-10-17", withNew)).toBe("Search intent for 17/10/26 (Saturday 17 October 2026) — 1 new, 1 growing");
    const growOnly = diffSnapshots([s("B", 5)], [s("B", 2)]);
    expect(buildSubject("2026-10-17", growOnly)).toBe("GSC Intent · AutoSocials · 17/10/26 · 1 growing (Saturday 17 October 2026)");
  });

  it("days with no comparison still produce an email", () => {
    for (const [kind, label] of [["no_data", "no data"], ["baseline", "baseline saved"], ["failed", "run failed"]] as const) {
      const e = renderDigest("2026-10-17", EMPTY_DIFF, { kind, reason: "why <x>" });
      expect(e.subject).toBe(`GSC Intent · AutoSocials · 17/10/26 · ${label} (Saturday 17 October 2026)`);
      expect(e.html).toContain("why &lt;x&gt;");
      expect(e.text).toContain("why <x>");
    }
  });

  it("picks the three summary cases", () => {
    expect(summaryCase(diffSnapshots([s("A", 1)], []))).toBe("new");
    expect(summaryCase(diffSnapshots([s("A", 5)], [s("A", 1)]))).toBe("growing");
    expect(summaryCase(diffSnapshots([s("A", 1)], [s("A", 1)]))).toBe("quiet");
  });

  it("escapes HTML and shows at most 3 example queries", () => {
    const evil = { ...s("<b>X</b>", 3), queries: ["a", "b", "c", "dddd"] };
    const { html } = renderDigest("2026-10-17", diffSnapshots([evil], [s("Z", 1)]));
    expect(html).not.toContain("<b>X</b>");
    expect(html).not.toContain("dddd");
  });
});
