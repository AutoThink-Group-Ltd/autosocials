import { describe, expect, it, vi } from "vitest";
import { adminContentOwnedPath, readAdminContent, readAdminContentLinks } from "@/lib/admin-content.server";

const media = vi.hoisted(() => ({ get: vi.fn() }));
const auth = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/render.server", () => ({ getMedia: media.get }));
vi.mock("@/lib/supabase-admin.server", () => ({ requireUser: auth.user, getAdminClient: auth.admin }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain = { inputValidator: () => chain, handler: (fn: unknown) => fn }; return chain; } }));
import { getAdminContentLinks, listAdminContent } from "@/lib/admin-content.functions";

describe("Super Admin content library authorization", () => {
  it("rejects unsigned callers before constructing a privileged client", async () => {
    auth.user.mockRejectedValue(new Error("Unauthorized"));
    const list = listAdminContent as unknown as (input: unknown) => Promise<unknown>;
    const links = getAdminContentLinks as unknown as (input: unknown) => Promise<unknown>;
    await expect(list({ data: { page: 0, search: "", model: "" } })).rejects.toThrow("Unauthorized");
    await expect(links({ data: { renderId: "render" } })).rejects.toThrow("Unauthorized");
    expect(auth.admin).not.toHaveBeenCalled();
  });
  it("denies normal users and failed role checks before reading any cross-workspace data", async () => {
    for (const response of [{ data: false, error: null }, { data: true, error: new Error("role lookup failed") }, { data: null, error: null }]) {
      const from = vi.fn(); const storage = { from: vi.fn() };
      const admin = { rpc: vi.fn(async () => response), from, storage };
      await expect(readAdminContent(admin as never, "user", { page: 0, search: "", model: "" })).rejects.toThrow("Forbidden");
      await expect(readAdminContentLinks(admin as never, "user", "render")).rejects.toThrow("Forbidden");
      expect(from).not.toHaveBeenCalled(); expect(storage.from).not.toHaveBeenCalled();
      expect(admin.rpc).toHaveBeenCalledWith("has_role", { _user_id: "user", _role: "super_admin" });
    }
  });
  it("lists paginated finished versions using frozen metadata, without returning stored paths or raw snapshots", async () => {
    const chain = { eq: vi.fn(), not: vi.fn(), neq: vi.fn(), order: vi.fn(), range: vi.fn(), or: vi.fn(), ilike: vi.fn() };
    for (const key of ["eq", "not", "neq", "order", "or", "ilike"] as const) chain[key].mockReturnValue(chain);
    chain.range.mockResolvedValue({ data: [{ id: "render", workspace_id: "workspace", version: 1, model: "model", created_at: "date", updated_at: "date", status: "done", brief_snapshot: { hook: "Original title", duration_s: 15, size: "1080x1920", secret: "not exposed" }, workspaces: { name: "Brand" }, creative_variants: { hook: "Edited title", duration_s: 30, size: "1920x1080" } }], count: 35, error: null });
    const admin = { rpc: vi.fn(async () => ({ data: true })), from: vi.fn(() => ({ select: () => chain })) };
    const result = await readAdminContent(admin as never, "admin", { page: 1, search: "Original", model: "model" });
    expect(chain.eq).toHaveBeenCalledWith("status", "done"); expect(chain.not).toHaveBeenCalledWith("storage_path", "is", null); expect(chain.range).toHaveBeenCalledWith(24, 47);
    expect(result.videos[0]).toMatchObject({ title: "Original title", version: 1, duration: 15, size: "1080x1920" });
    expect(result.total).toBe(35); expect(JSON.stringify(result)).not.toContain("secret"); expect(JSON.stringify(result)).not.toContain("storage_path");
  });
});

function linksFixture(path: string, status = "done") {
  const signed = vi.fn(async () => ({ data: { signedUrl: "https://storage.example/video" }, error: null }));
  const row = { id: "render", workspace_id: "workspace", status, storage_path: path, version: 2, provider_job_id: "provider-job" };
  const query = { eq: vi.fn(), single: vi.fn(async () => ({ data: row, error: null })) }; query.eq.mockReturnValue(query);
  const admin = { rpc: vi.fn(async () => ({ data: true })), from: vi.fn(() => ({ select: () => query })), storage: { from: vi.fn(() => ({ createSignedUrl: signed })) } };
  return { admin, signed };
}

describe("content library private media signing", () => {
  it("rejects traversal, cross-workspace paths and unfinished renders before signing", async () => {
    for (const path of ["other/video.mp4", "workspace/../other/video.mp4", "workspace/folder//video.mp4", "workspace/video.mp4?x=y", "workspace/a\\b.mp4"]) {
      expect(adminContentOwnedPath(path, "workspace")).toBe(false);
      const fixture = linksFixture(path);
      await expect(readAdminContentLinks(fixture.admin as never, "admin", "render")).rejects.toThrow("Invalid stored video path");
      expect(fixture.signed).not.toHaveBeenCalled();
    }
    const fixture = linksFixture("workspace/renders/video.mp4", "running");
    await expect(readAdminContentLinks(fixture.admin as never, "admin", "render")).rejects.toThrow("unavailable"); expect(fixture.signed).not.toHaveBeenCalled();
  });
  it("signs only the server-stored workspace path with a bounded lifetime and download filename", async () => {
    const fixture = linksFixture("workspace/renders/render/video.mp4");
    const result = await readAdminContentLinks(fixture.admin as never, "admin", "render");
    expect(fixture.signed).toHaveBeenCalledWith("workspace/renders/render/video.mp4", 900);
    expect(fixture.signed).toHaveBeenCalledWith("workspace/renders/render/video.mp4", 900, { download: "video-render-v2.mp4" }); expect(result.download).toBeTruthy();
  });
  it("supports legacy AutoToast media only when the returned workspace matches the render", async () => {
    const fixture = linksFixture("autotoast:legacy-media");
    media.get.mockResolvedValueOnce({ workspace_id: "another-workspace", status: "ready", playback_url: "https://example.com/private" });
    await expect(readAdminContentLinks(fixture.admin as never, "admin", "render")).rejects.toThrow("could not be verified");
    media.get.mockResolvedValueOnce({ workspace_id: "workspace", status: "ready", playback_url: "https://example.com/play", download_url: "https://example.com/download" });
    expect(await readAdminContentLinks(fixture.admin as never, "admin", "render")).toMatchObject({ playback: "https://example.com/play", download: "https://example.com/download" }); expect(fixture.signed).not.toHaveBeenCalled();
  });
  it("accepts an AutoToast render without a workspace only when its provider job matches", async () => {
    const fixture = linksFixture("autotoast:legacy-media");
    media.get.mockResolvedValueOnce({ workspace_id: null, kind: "render", render_job_id: "different-job", status: "ready" });
    await expect(readAdminContentLinks(fixture.admin as never, "admin", "render")).rejects.toThrow("could not be verified");
    media.get.mockResolvedValueOnce({ workspace_id: null, kind: "render", render_job_id: "provider-job", status: "ready", playback_url: "https://example.com/play" });
    expect(await readAdminContentLinks(fixture.admin as never, "admin", "render")).toMatchObject({ playback: "https://example.com/play" });
  });
});
