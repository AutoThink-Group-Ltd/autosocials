import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./virlo-activity.server", () => ({ recordedVirloSearch: vi.fn() }));
vi.mock("./virlo.server", () => ({ virloAvailable: vi.fn() }));
import { recordedVirloSearch } from "./virlo-activity.server";
import { virloAvailable } from "./virlo.server";
import { optionalVirloCreativeEvidence } from "./virlo-creative.server";

afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
describe("optional Virlo creative evidence", () => {
  it("never requests research when disabled or the topic contains private details", async () => {
    vi.mocked(virloAvailable).mockReturnValue(false);
    expect(await optionalVirloCreativeEvidence("w", "u", "skincare")).toBe("");
    vi.mocked(virloAvailable).mockReturnValue(true);
    expect(await optionalVirloCreativeEvidence("w", "u", "email me at person@example.com")).toBe("");
    expect(recordedVirloSearch).not.toHaveBeenCalled();
  });
  it("uses only sourced social links and marks captions as untrusted", async () => {
    vi.mocked(virloAvailable).mockReturnValue(true);
    vi.mocked(recordedVirloSearch).mockResolvedValue({ videos: [
      { url: "https://www.tiktok.com/@user/video/12", description: "Example", views: 50 },
      { url: "https://evil.test/a", description: "Bad" },
    ] });
    const text = await optionalVirloCreativeEvidence("w", "u", "skincare");
    expect(text).toContain("tiktok.com"); expect(text).toContain("untrusted"); expect(text).not.toContain("evil.test");
  });
  it("returns immediately without blocking creation when research fails", async () => {
    vi.mocked(virloAvailable).mockReturnValue(true);
    vi.mocked(recordedVirloSearch).mockRejectedValue(new Error("provider unavailable"));
    expect(await optionalVirloCreativeEvidence("w", "u", "skincare")).toBe("");
  });
  it("bounds even an unresponsive ledger or provider", async () => {
    vi.useFakeTimers(); vi.mocked(virloAvailable).mockReturnValue(true);
    vi.mocked(recordedVirloSearch).mockImplementation(() => new Promise(() => {}));
    const result = optionalVirloCreativeEvidence("w", "u", "skincare");
    await vi.advanceTimersByTimeAsync(3000); expect(await result).toBe("");
    expect(vi.mocked(recordedVirloSearch).mock.calls[0]?.[3]?.aborted).toBe(true);
  });
});
