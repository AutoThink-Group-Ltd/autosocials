import { describe, expect, it } from "vitest";
import {
  developerMarkdown,
  developerPages,
  searchDeveloperPages,
} from "./content";
import { addDeveloperUrls, publicPageSitemap } from "./sitemap";
import { SITE_URL, seoRoutes } from "@/lib/seo-routes";

describe("developer discovery", () => {
  it("renders every topic into the shared text index", () => {
    const text = developerMarkdown();
    expect(new Set(developerPages.map((page) => page.slug)).size).toBe(
      developerPages.length,
    );
    for (const page of developerPages) {
      expect(text).toContain(`/developers/${page.slug}`);
      for (const section of page.sections)
        expect(text).toContain(section.heading);
    }
  });
  it("includes linked self-hosting and provider setup guides", () => {
    const host = developerPages.find((page) => page.slug === "self-hosting");
    const keys = developerPages.find((page) => page.slug === "api-key-setup");
    expect(
      host?.sections.flatMap((section) => section.paragraphs).join(" "),
    ).toContain("/developers/api-key-setup");
    expect(
      keys?.sections.flatMap((section) => section.paragraphs).join(" "),
    ).toContain("/developers/self-hosting");
    expect(developerMarkdown()).toContain("HF_API_KEY_SECRET");
    expect(developerMarkdown()).toContain(
      "The first clean install is still pending.",
    );
    expect(developerMarkdown()).toContain("- [ ] Sign in with a test user");
  });
  it("searches page content case-insensitively", () => {
    expect(
      searchDeveloperPages("  PERPLEXITY  ").map((page) => page.slug),
    ).toContain("clients");
    expect(searchDeveloperPages("no-such-document")).toHaveLength(0);
  });
  it("preserves creator entries and avoids duplicating developer URLs", () => {
    const xml =
      "<urlset><url><loc>https://autosocials.com/tiktok/example</loc></url><url><loc>https://autosocials.com/developers</loc></url></urlset>";
    const result = addDeveloperUrls(xml, true);
    expect(result.valid).toBe(true);
    expect(result.body).toContain("https://autosocials.com/tiktok/example");
    expect(
      result.body.match(/<loc>https:\/\/autosocials.com\/developers<\/loc>/g),
    ).toHaveLength(1);
    for (const page of developerPages)
      expect(result.body).toContain(`/developers/${page.slug}</loc>`);
  });
  it("does not turn a failed or malformed upstream response into a sitemap", () => {
    expect(addDeveloperUrls("error", false)).toEqual({
      body: "error",
      valid: false,
    });
    expect(addDeveloperUrls("<urlset>", true).valid).toBe(false);
  });
  it("keeps the operator guides discoverable when the creator feed is unavailable", () => {
    const xml = publicPageSitemap();
    expect(xml).toContain("<urlset ");
    expect(xml).toContain(
      "<loc>https://autosocials.com/developers/self-hosting</loc>",
    );
    expect(xml).toContain(
      "<loc>https://autosocials.com/developers/api-key-setup</loc>",
    );
    for (const route of seoRoutes.filter((route) => route.noIndex)) {
      expect(xml).not.toContain("<loc>" + SITE_URL + route.path + "</loc>");
    }
  });
});
