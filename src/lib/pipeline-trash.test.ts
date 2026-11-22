import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: storage.from } },
}));
import { listPipelineTrash, setPipelineTrashed, listReturnedTilePlans, setTilePlanReturned } from "./pipeline-trash";
const workspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = "narrative:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:idea/one";
const name =
  Array.from(new TextEncoder().encode(key), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("") + ".json";
beforeEach(() => {
  vi.resetAllMocks();
  storage.from.mockReturnValue(storage);
});
describe("pipeline trash markers", () => {
  it("writes and restores an exact item marker in the private workspace folder", async () => {
    storage.upload.mockResolvedValue({ error: null });
    storage.remove.mockResolvedValue({ error: null });
    await setPipelineTrashed(workspace, key, true);
    expect(storage.from).toHaveBeenCalledWith("brand-assets-private");
    expect(storage.upload).toHaveBeenCalledWith(
      `${workspace}/pipeline-trash/${name}`,
      expect.any(Blob),
      expect.objectContaining({ upsert: true }),
    );
    await setPipelineTrashed(workspace, key, false);
    expect(storage.remove).toHaveBeenCalledWith([
      `${workspace}/pipeline-trash/${name}`,
    ]);
    expect(storage.remove.mock.calls[0]![0]).toHaveLength(1);
  });
  it("loads every page, ignores malformed markers and reports access errors", async () => {
    storage.list
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, () => ({ name })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ name: "bad.json" }], error: null });
    expect(await listPipelineTrash(workspace)).toHaveLength(1000);
    expect(storage.list).toHaveBeenLastCalledWith(
      `${workspace}/pipeline-trash`,
      expect.objectContaining({ offset: 1000 }),
    );
    storage.list.mockResolvedValueOnce({
      data: null,
      error: new Error("denied"),
    });
    await expect(listPipelineTrash(workspace)).rejects.toThrow("denied");
  });
  it("accepts a stable production item identity", async () => {
    storage.upload.mockResolvedValue({ error: null });
    await expect(
      setPipelineTrashed(
        workspace,
        `production-item:batch:${workspace}:tile:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
        true,
      ),
    ).resolves.toBeUndefined();
    expect(storage.upload).toHaveBeenCalledOnce();
  });
  it("rejects invalid workspace and keys without accessing storage", async () => {
    await expect(setPipelineTrashed("other/path", key, true)).rejects.toThrow(
      "Invalid workspace",
    );
    await expect(
      setPipelineTrashed(workspace, "invalid:item", true),
    ).rejects.toThrow("Invalid pipeline item");
    expect(storage.from).not.toHaveBeenCalled();
  });
});

it("stores returned tile plans separately from deleted items and restores their location", async () => {
  const id = `canvas:${workspace}`;
  const name = Array.from(new TextEncoder().encode(id), b => b.toString(16).padStart(2, "0")).join("") + ".json";
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.list.mockResolvedValue({ data: [{ name }], error: null });
  await setTilePlanReturned(workspace, id, true);
  expect(storage.upload.mock.calls[0]![0]).toBe(`${workspace}/pipeline-trash-returned/${name}`);
  expect(await listReturnedTilePlans(workspace)).toEqual([id]);
  await setTilePlanReturned(workspace, id, false);
  expect(storage.remove).toHaveBeenCalledWith([`${workspace}/pipeline-trash-returned/${name}`]);
  await expect(setTilePlanReturned(workspace, "batch:wrong", true)).rejects.toThrow();
});
