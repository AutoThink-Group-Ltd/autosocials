import { describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("./research.server", () => ({ authorizeResearch: access.authorize, loadResearchRun: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ from: access.query }) }));
import { previewVisualCompetitor, publicCompetitorUrl, refreshVisualShare, VisualReportSchema } from "./research-visual.server";

describe("visual report public boundary", () => {
  it("accepts public links and rejects credential-bearing or local destinations", () => {
    expect(publicCompetitorUrl("https://www.instagram.com/localbusiness/")).toBe("https://www.instagram.com/localbusiness/");
    expect(publicCompetitorUrl("localbusiness.co.uk")).toBe("https://localbusiness.co.uk/");
    expect(publicCompetitorUrl("@localbusiness")).toBe("https://www.instagram.com/localbusiness");
    expect(publicCompetitorUrl("tiktok:@localbusiness")).toBe("https://www.tiktok.com/@localbusiness");
    expect(publicCompetitorUrl("facebook:@localbusiness")).toBe("https://www.facebook.com/localbusiness");
    for (const url of ["https://localhost/test", "https://192.168.1.1/", "https://[::1]/", "https://secret:password@business.co.uk", "http://business.co.uk", "https://business.local"]) expect(publicCompetitorUrl(url)).toBeNull();
  });

  it("strips private and sampled-frame fields from visual examples", () => {
    const result = VisualReportSchema.parse({
      status: "ready", question: "PRIVATE_EMAIL", reply: "PRIVATE_REPLY", workspace_id: "PRIVATE_WORKSPACE",
      competitors: [{ id: "peer", name: "Peer", url: "https://www.instagram.com/peer", reason: "Similar local service", private_note: "PRIVATE_NOTE", posts: [{ id: "post", platform: "instagram", url: "https://www.instagram.com/p/real", caption: "Public caption", published_at: null, thumbnail_url: null, media_type: "video", metrics: { likes: 0 }, review_basis: "metadata", frames: ["PRIVATE_FRAME"] }] }],
      examples: [], comparisons: [], styles: [], directions: [],
    });
    expect(JSON.stringify(result)).toContain("Public caption");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(result.competitors[0]?.posts[0]?.metrics.likes).toBe(0);
  });

  it("keeps sourced examples when AI display copy exceeds its requested length", () => {
    const result = VisualReportSchema.parse({
      status: "ready", competitors: [], examples: [{ post_id: "real-post", style: "A".repeat(110), relevance: "B".repeat(280), on_camera: "unknown", production: "unknown" }],
      comparisons: [], styles: [], directions: [],
    });
    expect(result.examples[0]?.post_id).toBe("real-post");
    expect(result.examples[0]?.style).toHaveLength(80);
    expect(result.examples[0]?.relevance).toHaveLength(240);
  });

  it("checks workspace access before reading a report or writing a refresh", async () => {
    access.authorize.mockRejectedValueOnce(new Error("Workspace access denied"));
    await expect(refreshVisualShare("workspace", "run", "a".repeat(64), null)).rejects.toThrow("Workspace access denied");
    expect(access.query).not.toHaveBeenCalled();
  });

  it("checks workspace access and requires a canonical public profile before previewing posts", async () => {
    const target = { id: "instagram:agency", platform: "instagram" as const, handle: "agency", url: "https://www.instagram.com/agency/" };
    access.authorize.mockRejectedValueOnce(new Error("Workspace access denied"));
    await expect(previewVisualCompetitor("workspace", target)).rejects.toThrow("Workspace access denied");
    access.authorize.mockResolvedValueOnce(undefined);
    await expect(previewVisualCompetitor("workspace", { ...target, url: "https://private.example/" })).rejects.toThrow("Choose a public social profile");
    expect(access.query).not.toHaveBeenCalled();
  });
});
