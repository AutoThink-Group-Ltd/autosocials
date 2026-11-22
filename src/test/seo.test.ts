import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SITE_URL, seoRoutes } from "@/lib/seo-routes";
import { seoHead } from "@/lib/seo-head";

describe("SEO identity", () => {
  it("uses the apex domain as the canonical host", () => {
    expect(SITE_URL).toBe("https://autosocials.com");
  });

  it("gives every public route one self-referencing canonical", () => {
    for (const r of seoRoutes) {
      const links = (seoHead(r.path) as { links: { rel: string; href: string }[] }).links;
      const canon = links.filter((l) => l.rel === "canonical");
      expect(canon).toHaveLength(1);
      expect(canon[0]?.href).toBe(`https://autosocials.com${r.path}`);
    }
  });

  it("has unique titles and descriptions", () => {
    expect(new Set(seoRoutes.map((r) => r.title)).size).toBe(seoRoutes.length);
    expect(new Set(seoRoutes.map((r) => r.description)).size).toBe(seoRoutes.length);
  });

  it("keeps the sign-in page out of search", () => {
    expect(seoRoutes.find((r) => r.path === "/auth")?.noIndex).toBe(true);
  });
});

describe("Discovery files", () => {
  const robots = readFileSync("public/robots.txt", "utf8");
  const sitemapFn = readFileSync("supabase/functions/generate-sitemap/index.ts", "utf8");

  it("robots points to the apex sitemap and blocks the app", () => {
    expect(robots).toContain("Sitemap: https://autosocials.com/sitemap.xml");
    expect(robots).toMatch(/Disallow: \/app\n/);
    expect(robots).not.toContain("www.autosocials.com");
  });

  it("sitemap lists exactly the indexable public routes", () => {
    const m = sitemapFn.match(/STATIC_PAGES = \[([^\]]+)\]/);
    const listed = (m?.[1]?.match(/"[^"]+"/g) ?? []).map((s) => s.slice(1, -1)).sort();
    const indexable = seoRoutes.filter((r) => !r.noIndex).map((r) => r.path).sort();
    expect(listed).toEqual(indexable);
    expect(sitemapFn).toContain('const SITE_URL = "https://autosocials.com"');
  });
});
