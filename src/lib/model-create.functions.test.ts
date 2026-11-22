import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("./supabase-admin.server", () => auth);
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
import { ModelCreateInput, ModelPromptInput, ModelVideoRequestInput, createModelVideo, draftModelPrompt, getModelVideoRequest } from "./model-create.functions";
afterEach(() => vi.resetAllMocks());
describe("Models endpoints", () => {
  const data = { workspace_id: "11111111-1111-4111-8111-111111111111", request_id: "22222222-2222-4222-8222-222222222222", prompt: "Show the product", file_ids: [], style_id: "brand-motion", duration: 60, size: "1080x1350", captions: "clean" };
  it("bounds input and keeps all existing lengths and formats", () => {
    expect(ModelCreateInput.parse(data).duration).toBe(60);
    expect(ModelPromptInput.parse({ ...data, prompt: "" }).prompt).toBe("");
    expect(() => ModelCreateInput.parse({ ...data, request_id: "bad" })).toThrow();
    expect(() => ModelCreateInput.parse({ ...data, prompt: "a".repeat(5001) })).toThrow();
    expect(() => ModelCreateInput.parse({ ...data, file_ids: Array(21).fill(data.workspace_id) })).toThrow();
    expect(() => ModelCreateInput.parse({ ...data, style_id: "fictional-model" })).toThrow();
    expect(() => ModelVideoRequestInput.parse({ ...data, request_id: "bad" })).toThrow();
  });
  it("rejects unsigned callers before loading production helpers", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthorized"));
    for (const endpoint of [createModelVideo, draftModelPrompt, getModelVideoRequest]) {
      const handler = endpoint as unknown as (context: { data: unknown }) => Promise<unknown>;
      await expect(handler({ data })).rejects.toThrow("Unauthorized");
    }
  });
});
