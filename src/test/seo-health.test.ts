import { describe, it, expect } from "vitest";
import { parsePage, pageIssues, scoreAudit, duplicates, lastmodLooksFake } from "@/lib/seo-audit";
import { publicFacts } from "@/lib/public-facts";
import { renderSeoEmail } from "@/lib/seo-email";

const SITE = "https://autosocials.com";
const html = (o: { title?: string; canonical?: string; h1s?: number; words?: number }) => `<html><head><title>${o.title ?? "Pricing"}</title>
<meta name="description" content="${"d".repeat(130)}"><link rel="canonical" href="${o.canonical ?? `${SITE}/pricing`}">
<meta property="og:image" content="${SITE}/og-image.jpg"><script type="application/ld+json">{"@type":"WebPage"}</script></head>
<body>${"<h1>x</h1>".repeat(o.h1s ?? 1)}${"<p>word</p>".repeat(o.words ?? 200)}<a href="/">Home</a></body></html>`;
const report = (h: string, extra = {}) => ({ path: "/pricing", status: 200, inSitemap: true, linksIn: 2, ...parsePage(h, SITE), ...extra });

describe("SEO health checks", () => {
  it("passes a complete page", () => {
    expect(pageIssues(report(html({})), SITE, new Set(), new Set(), true)).toEqual([]);
  });
  it("flags a canonical pointing to another host as critical", () => {
    const i = pageIssues(report(html({ canonical: "https://www.autosocials.com/pricing" })), SITE, new Set(), new Set(), true);
    expect(i.some((x) => x.severity === "critical" && x.message.startsWith("Canonical"))).toBe(true);
  });
  it("flags a broken share image as critical", () => {
    expect(pageIssues(report(html({})), SITE, new Set(), new Set(), false).some((x) => x.message === "Share image is broken")).toBe(true);
  });
  it("flags thin pages under 150 words", () => {
    expect(pageIssues(report(html({ words: 20 })), SITE, new Set(), new Set(), true).some((x) => x.message.includes("words"))).toBe(true);
  });
  it("finds duplicate titles", () => {
    expect([...duplicates(["A", "B", "A"])]).toEqual(["A"]);
  });
  it("one critical issue costs 12 points", () => {
    expect(scoreAudit([{ severity: "critical" }])).toBe(88);
  });
  it("treats every sitemap URL stamped with today as fake", () => {
    expect(lastmodLooksFake(["2026-10-20", "2026-10-20", "2026-10-20", "2026-10-20"], "2026-10-20")).toBe(true);
    expect(lastmodLooksFake(["2026-03-12", "2026-10-20", "2026-03-15", "2026-03-13"], "2026-10-20")).toBe(false);
  });
});

describe("public facts", () => {
  it("lists the four plans at their real monthly GBP prices", () => {
    expect(publicFacts().plans.map((p) => [p.name, p.monthly])).toEqual([["Free", 0], ["Starter", 49], ["Growth", 79], ["Scale", 199], ["Pro", 299]]);
  });
  it("never contains emails, ids or tokens", () => {
    expect(JSON.stringify(publicFacts())).not.toMatch(/@[a-z]+\.|price_|uuid|token|secret/i);
  });
});

describe("SEO email", () => {
  it("puts the score and critical count in the subject", () => {
    const e = renderSeoEmail({ date: "Mon 20 Oct 2026", score: 81, prevScore: null, counts: { critical: 1, high: 2, medium: 0, low: 0 }, pages: 9, issues: [], discovery: [], gsc: null, dashboardUrl: `${SITE}/app/admin/seo`, logoUrl: `${SITE}/logo.png` });
    expect(e.subject).toBe("SEO health 81/100 · 1 critical · Mon 20 Oct 2026");
  });
});

describe("site score", () => {
  it("averages pages (70%) with discovery checks (30%)", async () => {
    const { siteScore } = await import("@/lib/seo-audit");
    expect(siteScore([[], [{ severity: "critical" }]], [true, false])).toBe(80);
  });
});
