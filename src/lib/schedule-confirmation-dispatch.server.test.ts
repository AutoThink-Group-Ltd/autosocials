import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), fetch: vi.fn(), download: vi.fn(), select: vi.fn(), user: vi.fn(), enqueue: vi.fn(), alert: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ update: mocks.update, select: mocks.select }), storage: { from: () => ({ download: mocks.download }) }, auth: { admin: { getUserById: mocks.user } } }) }));
vi.mock("./schedule-confirmation-enqueue.server", () => ({ enqueueScheduleConfirmation: mocks.enqueue }));
vi.mock("./creation-schedule-failure.server", () => ({ recordCreationScheduleFailure: mocks.alert }));
import { dispatchScheduleConfirmation, drainScheduleConfirmations } from "./schedule-confirmation-dispatch.server";
import { emailThumbnail } from "./schedule-confirmation-dispatch.server";
import jpeg from "jpeg-js";

describe("schedule confirmation dispatch", () => {
  beforeEach(() => {
    vi.stubEnv("SENDGRID_API_KEY", "test-key");
    vi.stubGlobal("fetch", mocks.fetch);
    const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) };
    chain.lt = () => chain;
    mocks.update.mockReturnValue(chain);
    mocks.rpc.mockReset(); mocks.fetch.mockReset(); mocks.update.mockClear();
  });
  it("recovers fully finalized requests and leaves partial assembling requests alone", async () => {
    const requested: string[] = [];
    const chain: any = { eq: (_: string, status: string) => { requested.push(status); return chain; }, lte: () => chain, order: () => chain, limit: async () => ({ data: requested.at(-1) === "ready_to_assemble" ? [{ request_id: "r", workspace_id: "w", user_id: "u" }] : [], error: null }) };
    mocks.select.mockReturnValue(chain);
    mocks.user.mockResolvedValue({ data: { user: { email: "owner@example.test" } }, error: null });
    mocks.enqueue.mockResolvedValue(undefined);
    await drainScheduleConfirmations();
    expect(mocks.enqueue).toHaveBeenCalledWith("r", "w", "u", "owner@example.test");
    expect(requested).toEqual(["ready_to_assemble", "pending"]);
  });
  it("does not submit when the request was already claimed", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await dispatchScheduleConfirmation("request");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("reduces large images to bounded embedded thumbnails", () => {
    const source = jpeg.encode({ width: 1000, height: 1000, data: Buffer.alloc(1000 * 1000 * 4, 255) }, 95).data;
    const image = jpeg.decode(emailThumbnail(Buffer.from(source)), { useTArray: true });
    expect([image.width, image.height]).toEqual([192, 192]);
  });
  it("records an uncertain result rather than retrying a lost provider response", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ request_id: "request", workspace_id: "ws", payload: { workspace: "Brand", timezone: "UTC", recipient: "owner@example.test", items: [{ title: "Post", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook"], mediaKind: "video" }] } }], error: null });
    mocks.fetch.mockRejectedValue(new Error("network"));
    await dispatchScheduleConfirmation("request");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "uncertain" }));
  });
  it("backs off on provider rate limits and stops after the third attempt", async () => {
    const row = { request_id: "request", workspace_id: "ws", attempts: 1, payload: { workspace: "Brand", timezone: "UTC", recipient: "owner@example.test", items: [{ title: "Post", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook"], mediaKind: "video" }] } };
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.fetch.mockResolvedValue({ ok: false, status: 429 });
    await dispatchScheduleConfirmation("request");
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "pending", next_attempt_at: expect.any(String) }));
    mocks.rpc.mockResolvedValue({ data: [{ ...row, attempts: 3 }], error: null });
    await dispatchScheduleConfirmation("request");
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
  });
  it("does not send an incomplete confirmation when an image download fails", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ request_id: "request", workspace_id: "ws", attempts: 1, payload: { workspace: "Brand", timezone: "UTC", recipient: "owner@example.test", items: [{ title: "Post", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook"], mediaKind: "image", mediaPath: "ws/social-tiles/post.jpg" }] } }], error: null });
    mocks.download.mockResolvedValue({ data: null, error: { message: "temporary" } });
    await dispatchScheduleConfirmation("request");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", error: "Confirmed image preview could not be loaded" }));
  });
  it("retries failures before submission but never retries a provider 5xx", async () => {
    const row = { request_id: "request", workspace_id: "ws", attempts: 1, payload: { workspace: "Brand", timezone: "UTC", recipient: "owner@example.test", items: [{ title: "Post", scheduledAt: "2026-11-20T09:00:00Z", channels: ["Facebook"], mediaKind: "video" }] } };
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    vi.stubEnv("SENDGRID_API_KEY", "");
    await dispatchScheduleConfirmation("request");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "pending" }));
    vi.stubEnv("SENDGRID_API_KEY", "test-key");
    mocks.fetch.mockResolvedValue({ ok: false, status: 503 });
    await dispatchScheduleConfirmation("request");
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "uncertain" }));
  });
});
