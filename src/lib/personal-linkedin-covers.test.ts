import { describe, expect, it, vi } from "vitest";
import { isWorkspaceLinkedInCover } from "./personal-linkedin-covers";

const { fetchImage, upload, exists } = vi.hoisted(() => ({ fetchImage: vi.fn(), upload: vi.fn(), exists: vi.fn() }));
vi.mock("./personal-brand-media.server", () => ({ fetchPersonalImage: fetchImage }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ storage: { from: () => ({ upload, exists }) } }) }));
import { cacheLinkedInCover } from "./personal-linkedin-covers.server";

describe("LinkedIn cover cache", () => {
  it("stores a validated image under a workspace path without its provider URL", async () => {
    fetchImage.mockResolvedValue("data:image/png;base64,aGVsbG8=");
    upload.mockResolvedValue({ error: null });
    const path = await cacheLinkedInCover("workspace", "https://media.licdn.com/image?token=secret");
    expect(path && isWorkspaceLinkedInCover("workspace", path)).toBe(true);
    expect(path).not.toContain("secret");
    expect(isWorkspaceLinkedInCover("other", path!)).toBe(false);
    expect(isWorkspaceLinkedInCover("workspace", "workspace/social-previews/linkedin/../other.png")).toBe(false);
  });
  it("does not store invalid image data", async () => {
    fetchImage.mockResolvedValue("data:image/svg+xml;base64,aGVsbG8=");
    expect(await cacheLinkedInCover("workspace", "https://media.licdn.com/image")).toBeNull();
  });
});
