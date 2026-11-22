import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("./supabase-admin.server", () => auth);
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
import { AssetCreationSaveInput, getAssetCreation, saveAssetCreation } from "./asset-creation.functions";
beforeEach(() => vi.resetAllMocks());
describe("asset creation endpoint boundary", () => {
  it("accepts saved options and refuses unknown actions or invalid formats", () => {
    const input = { workspace_id: "11111111-1111-4111-8111-111111111111", batch_id: "22222222-2222-4222-8222-222222222222", recipe_id: "reaction-demo", file_ids: [], duration: 15, size: "1080x1920", captions: "clean", voice: "Kore", note: "Show the app" };
    expect(AssetCreationSaveInput.parse(input)).toMatchObject({ ...input, deferred: false });
    expect(() => AssetCreationSaveInput.parse({ ...input, generate: true })).toThrow();
    expect(() => AssetCreationSaveInput.parse({ ...input, duration: 999 })).toThrow();
  });
  it("rejects unsigned callers before accessing privileged helpers", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthorized"));
    for (const endpoint of [getAssetCreation, saveAssetCreation]) await expect((endpoint as unknown as (ctx: { data: unknown }) => Promise<unknown>)({ data: {} })).rejects.toThrow("Unauthorized");
  });
});
