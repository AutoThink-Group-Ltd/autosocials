import { beforeEach, describe, expect, it, vi } from "vitest";
const { existing, inserted, hash } = vi.hoisted(() => ({ existing: vi.fn(), inserted: vi.fn(), hash: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: "test-token", user: { id: "test-user" } } } }) },
  from: () => ({
    select: () => {
      const query = { eq: () => query, is: () => query, in: existing, limit: async () => ({ data: [] }) };
      return query;
    },
    insert: () => ({ select: () => ({ single: inserted }) }),
  }),
} }));
vi.mock("./autotoastUpload", () => ({ uploadToAutoToast: vi.fn() }));
vi.mock("@/lib/brand-files", async (original) => ({ ...await original<object>(), hashBlob: hash }));
import { startUpload } from "./uploadStore";
import { uploadToAutoToast } from "./autotoastUpload";

beforeEach(() => {
  vi.clearAllMocks();
  hash.mockResolvedValue("same-image-hash");
  existing.mockResolvedValue({ data: [], error: null });
  inserted.mockResolvedValue({ data: { id: "new-image-id" }, error: null });
  vi.stubGlobal("XMLHttpRequest", class {
    status = 200;
    upload = {};
    onload?: () => void;
    open() {}
    setRequestHeader() {}
    send() { queueMicrotask(() => this.onload?.()); }
  });
});

describe("upload reference IDs", () => {
  it("returns the recorded file ID for an AutoToast video", async () => {
    vi.mocked(uploadToAutoToast).mockResolvedValueOnce({ ok: true, file_id: "saved-video-id" });
    const result = await startUpload("workspace-a", [new File(["video"], "demo.mp4", { type: "video/mp4" })]);
    expect(result.files).toEqual([{ name: "demo.mp4", fileId: "saved-video-id" }]);
  });
  it("returns the existing workspace asset ID for a duplicate image", async () => {
    existing.mockResolvedValue({ data: [{ id: "existing-image-id", content_hash: "same-image-hash" }], error: null });
    const result = await startUpload("workspace-a", [new File(["photo"], "first.jpg", { type: "image/jpeg" })]);
    expect(result.files).toEqual([{ name: "first.jpg", fileId: "existing-image-id" }]);
    expect(inserted).not.toHaveBeenCalled();
  });

  it("returns one saved ID for repeated images within the same drop", async () => {
    const result = await startUpload("workspace-a", [new File(["photo"], "first.jpg", { type: "image/jpeg" }), new File(["photo"], "copy.jpg", { type: "image/jpeg" })]);
    expect(result.files).toEqual([{ name: "first.jpg", fileId: "new-image-id" }, { name: "copy.jpg", fileId: "new-image-id" }]);
    expect(inserted).toHaveBeenCalledTimes(1);
  });

  it("never reports an asset as saved when the database insert fails", async () => {
    inserted.mockResolvedValue({ data: null, error: { message: "Not allowed" } });
    const result = await startUpload("workspace-a", [new File(["photo"], "first.jpg", { type: "image/jpeg" })]);
    expect(result.files[0]?.fileId).toBeNull();
    expect(result.errors).toEqual(["first.jpg: Not allowed"]);
  });

  it("preserves saved IDs while reporting a different image's failure", async () => {
    hash.mockResolvedValueOnce("first-hash").mockResolvedValueOnce("second-hash");
    inserted.mockResolvedValueOnce({ data: { id: "saved-first-id" }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "Not allowed" } });
    const result = await startUpload("workspace-a", [new File(["first"], "first.jpg", { type: "image/jpeg" }), new File(["second"], "second.jpg", { type: "image/jpeg" })]);
    expect(result.files).toEqual([{ name: "first.jpg", fileId: "saved-first-id" }, { name: "second.jpg", fileId: null, error: "second.jpg: Not allowed" }]);
    expect(result.errors).toEqual(["second.jpg: Not allowed"]);
  });
});
