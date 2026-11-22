import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { let validate = (value: unknown) => value; const chain = { inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: any) => (input: any) => fn({ data: validate(input.data) }) }; return chain; } }));
vi.mock("../lib/supabase-admin.server", () => ({ requireUser: async () => ({ id: "user", email: "test@example.com" }), getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("../lib/email-layout.server", () => ({ FROM: { email: "support@example.com" }, renderEmail: (input: unknown) => ({ text: JSON.stringify(input), html: "safe" }), sendViaSendGrid: mocks.send }));
import { requestVideoSupport } from "../lib/video-support.functions";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: true, error: null }); mocks.send.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
    single: async () => ({ data: { id, workspace_id: id, module: "create", blocks: [{ type: "direct_video", title: "Film", request_id: id, status: "queued", reason: "", reference_count: 1, duration: 30, aspect_ratio: "9:16", resolution: "1080p", options: [], message: "private full prompt", thread_id: id, file_ids: [id], variant_id: id }] }, error: null }),
    maybeSingle: async () => ({ data: { id, status: "failed", phase: "provider", error: "Provider limit reached" }, error: null }) }; return q; });
});
it("checks workspace access before sending support", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await expect((requestVideoSupport as any)({ data: { canvas_id: id } })).rejects.toThrow("Forbidden");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("sends verified job details without the production prompt", async () => {
  await expect((requestVideoSupport as any)({ data: { canvas_id: id } })).resolves.toHaveProperty("reference");
  expect(mocks.send).toHaveBeenCalledOnce();
  const message = JSON.stringify(mocks.send.mock.calls[0]);
  expect(message).toContain("Provider limit reached");
  expect(message).not.toContain("private full prompt");
});
