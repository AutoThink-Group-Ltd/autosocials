import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getAdminClient } from "./supabase-admin.server";
const mocks = vi.hoisted(() => ({ media: vi.fn(), download: vi.fn() }));
vi.mock("./render.server", () => ({ getMedia: mocks.media }));
vi.mock("./creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { loadApprovedSoundtrack } from "./production-audio.server";
import { pcmToWav } from "./film-length";
const ws = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const plan = { delivery: { mode: "assembled_ad", music_file_id: id, music_rights_confirmed: true } };
const file = () => ({ id, workspace_id: ws, kind: "audio", media_id: "media", storage_path: "autotoast:media", size_bytes: 16044 });
function database(row: unknown) { const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data: row })) }; return { from: vi.fn(() => chain) } as unknown as ReturnType<typeof getAdminClient>; }
beforeEach(() => { vi.clearAllMocks(); mocks.media.mockResolvedValue({ download_url: "https://media.example/signed" }); mocks.download.mockResolvedValue({ bytes: new Uint8Array(pcmToWav(new Uint8Array(16000), 8000)) }); });
describe("owned soundtrack loading", () => {
  it("supports the existing AutoToast audio uploader using bounded safe download", async () => {
    expect(await loadApprovedSoundtrack(database(file()), ws, plan)).toBeInstanceOf(ArrayBuffer);
    expect(mocks.media).toHaveBeenCalledWith("media");
    expect(mocks.download).toHaveBeenCalledWith("https://media.example/signed", { expected: "audio", maxBytes: 20 * 1024 * 1024 });
  });
  it("rejects cross-workspace rows, mismatched media identities and absent rights before downloads", async () => {
    await expect(loadApprovedSoundtrack(database({ ...file(), workspace_id: "other" }), ws, plan)).rejects.toThrow();
    await expect(loadApprovedSoundtrack(database({ ...file(), storage_path: "autotoast:other" }), ws, plan)).rejects.toThrow();
    await expect(loadApprovedSoundtrack(database(file()), ws, { delivery: { mode: "assembled_ad", music_file_id: id } })).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
