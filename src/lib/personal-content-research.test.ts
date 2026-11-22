import { expect, it, vi } from "vitest";
import { personalContentResearch, personalProductSites, productReferencePages } from "./personal-content-research.server";

const goalBrief = [
  "## Products to focus on", "- **ExampleMailer** — https://examplemailer.com — Lifecycle email.",
  "- Duplicate https://www.examplemailer.com/", "- Private https://127.0.0.1/",
  "## Examples", "- A competitor at https://mailchimp.com/",
].join("\n");

it("uses approved product domains and follows only relevant same-site references", () => {
  expect(personalProductSites(goalBrief)).toEqual(["https://examplemailer.com/"]);
  expect(productReferencePages("https://examplemailer.com/", [
    "/auth?tab=signup", "https://different.com/features", "/product/marketing-engine#plans", "/product/leo", "/docs",
  ])).toEqual(["https://examplemailer.com/product/marketing-engine", "https://examplemailer.com/docs"]);
});

it("feeds official feature pages and the workspace's recent angles into planning", async () => {
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key");
  const saved = vi.fn((_: string, request: RequestInit) => {
    const { url } = JSON.parse(String(request.body));
    const data = url.endsWith("marketing-engine") ? { markdown: "Review the newsletter and test-send before launch." }
      : url.endsWith("/docs") ? { markdown: "Manage sender profiles and design templates." }
      : { markdown: "ExampleMailer supports lifecycle marketing.", links: ["/product/marketing-engine", "/docs", "https://other.com/product"] };
    return Promise.resolve(Response.json({ success: true, data: { ...data, metadata: { url } } }));
  });
  vi.stubGlobal("fetch", saved);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ caption: "When a welcome flow should stop.", status: "scheduled" }] }) };
  try {
    const result = await personalContentResearch({ from: () => query } as unknown as Parameters<typeof personalContentResearch>[0], "my-workspace", goalBrief);
    expect(saved).toHaveBeenCalledTimes(3);
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "my-workspace");
    expect(result).toContain("https://examplemailer.com/product/marketing-engine");
    expect(result).toContain("Review the newsletter and test-send before launch.");
    expect(result).toContain("Manage sender profiles and design templates.");
    expect(result).toContain("When a welcome flow should stop.");
    expect(result).toContain("Treat sample topics as examples.");
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
