import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.getAdminClient }));
import { assemblePublishEvent, dispatchPublishDelivery, makePublishStore, resolveEligible, type PublishStore } from "./publish-notifications-dispatch.server";

const event = { id: "event", target_id: "target", post_id: "post", workspace_id: "client-a", created_at: "2026-11-13T12:00:00Z" };
const key = { event_id: "event", user_id: "user" };
function store(): PublishStore {
  return {
    eligible: vi.fn().mockResolvedValue(["user"]), addDeliveries: vi.fn().mockResolvedValue(undefined), finishEvent: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue({ ...key, attempts: 1 }), event: vi.fn().mockResolvedValue(event), stillEligible: vi.fn().mockResolvedValue(true),
    details: vi.fn().mockResolvedValue({ email: "user@example.test", workspace: "A <brand>", platform: "Instagram", caption: "<script>" }),
    finishDelivery: vi.fn().mockResolvedValue(undefined),
  };
}

describe("publishing notification resolution", () => {
  it("requires workspace switch, selection, opt-in and current membership", () => {
    const people = [{ user_id: "one", selected: true, opted_in: true }, { user_id: "two", selected: true, opted_in: false }, { user_id: "three", selected: false, opted_in: true }, { user_id: "removed", selected: true, opted_in: true }];
    expect(resolveEligible(false, people, ["one", "two", "three"])).toEqual([]);
    expect(resolveEligible(true, people, ["one", "two", "three"])).toEqual(["one"]);
  });
  it("uses the event workspace and records recipients before completing an event", async () => {
    const s = store();
    await assemblePublishEvent(event, s);
    expect(s.eligible).toHaveBeenCalledWith("client-a", event.created_at);
    expect(s.addDeliveries).toHaveBeenCalledWith("event", ["user"]);
    expect(vi.mocked(s.addDeliveries).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(s.finishEvent).mock.invocationCallOrder[0]!);
    vi.mocked(s.addDeliveries).mockRejectedValueOnce(new Error("db"));
    await expect(assemblePublishEvent(event, s)).rejects.toThrow();
    expect(s.finishEvent).toHaveBeenCalledTimes(1);
  });
  it("limits settings and recipient choices to those saved by publication time", async () => {
    const filters: Array<[string, string, unknown]> = [];
    const admin = { from: (name: string) => {
      const data = name === "publish_notification_settings" ? { enabled: true } : name === "publish_notification_recipients" ? [{ user_id: "user", selected: true, opted_in: true }] : [{ user_id: "user" }];
      const q: any = { select: () => q, eq: () => q, lte: (column: string, value: unknown) => { filters.push([name, column, value]); return q; }, maybeSingle: async () => ({ data, error: null }), then: (resolve: (value: unknown) => void) => resolve({ data, error: null }) };
      return q;
    } };
    mocks.getAdminClient.mockReturnValue(admin);
    expect(await makePublishStore().eligible(event.workspace_id, event.created_at)).toEqual(["user"]);
    expect(filters).toEqual([
      ["publish_notification_settings", "updated_at", event.created_at],
      ["publish_notification_recipients", "updated_at", event.created_at],
      ["workspace_members", "created_at", event.created_at],
    ]);
  });
  it("includes an opted-in super-admin with current access and excludes access that was revoked", async () => {
    let allowed = true;
    const admin = { from: (name: string) => {
      const data = name === "publish_notification_settings" ? { enabled: true } : name === "publish_notification_recipients" ? [{ user_id: "user", selected: true, opted_in: true }] : [];
      const q: any = { select: () => q, eq: () => q, lte: () => q, maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }), then: (resolve: (value: unknown) => void) => resolve({ data, error: null }) };
      return q;
    }, rpc: async (name: string) => ({ data: name === "is_workspace_member" && allowed, error: null }) };
    mocks.getAdminClient.mockReturnValue(admin);
    const actual = makePublishStore();
    expect(await actual.eligible("client-a", event.created_at)).toEqual(["user"]);
    expect(await actual.stillEligible("client-a", "user", event.created_at)).toBe(true);
    allowed = false;
    expect(await actual.stillEligible("client-a", "user", event.created_at)).toBe(false);
  });
  it("does not let a direct member added after publication bypass the event-time check", async () => {
    const admin = { from: (name: string) => {
      let historical = false;
      const data = name === "publish_notification_settings" ? { enabled: true } : name === "publish_notification_recipients" ? [{ user_id: "user", selected: true, opted_in: true }] : [{ user_id: "user" }];
      const q: any = { select: () => q, eq: () => q, lte: () => { historical = true; return q; }, maybeSingle: async () => ({ data: name === "workspace_members" && historical ? null : Array.isArray(data) ? data[0] : data, error: null }), then: (resolve: (value: unknown) => void) => resolve({ data: name === "workspace_members" && historical ? [] : data, error: null }) };
      return q;
    }, rpc: async (name: string) => ({ data: name === "is_workspace_member", error: null }) };
    mocks.getAdminClient.mockReturnValue(admin);
    const actual = makePublishStore();
    expect(await actual.eligible("client-a", event.created_at)).toEqual([]);
    expect(await actual.stillEligible("client-a", "user", event.created_at)).toBe(false);
  });
  it("suppresses a previously queued delivery when a user opts out or loses membership", async () => {
    const s = store(); vi.mocked(s.stillEligible).mockResolvedValue(false);
    const send = vi.fn();
    await dispatchPublishDelivery(key, s, send);
    expect(s.stillEligible).toHaveBeenCalledWith("client-a", "user", event.created_at);
    expect(send).not.toHaveBeenCalled();
    expect(s.finishDelivery).toHaveBeenCalledWith(key, expect.objectContaining({ status: "suppressed" }));
  });
  it("does not send twice when another worker already claimed the event", async () => {
    const s = store(); vi.mocked(s.claim).mockResolvedValue(null);
    const send = vi.fn(); await dispatchPublishDelivery(key, s, send);
    expect(send).not.toHaveBeenCalled();
    expect(s.finishDelivery).not.toHaveBeenCalled();
  });
  it("escapes post details and records provider acceptance for one recipient", async () => {
    const s = store(); const send = vi.fn().mockResolvedValue({ status: 202, messageId: "accepted" });
    await dispatchPublishDelivery(key, s, send);
    expect(send).toHaveBeenCalledWith("user@example.test", expect.objectContaining({ html: expect.stringContaining("&lt;script&gt;") }));
    expect(s.finishDelivery).toHaveBeenCalledWith(key, expect.objectContaining({ status: "sent", provider_message_id: "accepted" }));
  });
  it("includes the channel link, full caption and inline preview in both email formats", async () => {
    const s = store();
    const caption = "A".repeat(350);
    const preview = { content: "aW1hZ2U=", filename: "post-preview", type: "image/jpeg", disposition: "inline", content_id: "published-post-preview" };
    vi.mocked(s.details).mockResolvedValue({ email: "user@example.test", workspace: "Brand", platform: "Instagram", caption, permalink: "https://www.instagram.com/p/example/", preview });
    const send = vi.fn().mockResolvedValue({ status: 202, messageId: null });
    await dispatchPublishDelivery(key, s, send);
    const message = send.mock.calls[0]![1];
    expect(message.html).toContain('src="cid:published-post-preview"');
    expect(message.html).toContain(caption);
    expect(message.text).toContain(caption);
    expect(message.text).toContain("https://www.instagram.com/p/example/");
    expect(message.attachments).toEqual([preview]);
  });
  it("loads the published channel caption and embeds its saved social tile", async () => {
    const rows: Record<string, unknown> = {
      posts: { caption: "Shared caption" },
      post_targets: { platform: "linkedin", status: "published", caption_override: "LinkedIn caption", permalink: null },
      workspaces: { name: "Brand" },
      post_media: [{ kind: "image", storage_path: "client-a/social-tiles/post.jpg", mime: "image/jpeg" }],
    };
    const download = vi.fn().mockResolvedValue({ data: { size: 4, arrayBuffer: async () => Buffer.from("tile") }, error: null });
    mocks.getAdminClient.mockReturnValue({
      from: (name: string) => {
        const query: any = {
          select: () => query, eq: () => query, order: () => query,
          limit: async () => ({ data: rows[name], error: null }),
          maybeSingle: async () => ({ data: rows[name], error: null }),
        };
        return query;
      },
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "user@example.test" } }, error: null }) } },
      storage: { from: () => ({ download }) },
    });
    const details = await makePublishStore().details(event, "user");
    expect(details.caption).toBe("LinkedIn caption");
    expect(details.preview).toMatchObject({ content: Buffer.from("tile").toString("base64"), type: "image/jpeg", disposition: "inline" });
    expect(download).toHaveBeenCalledWith("client-a/social-tiles/post.jpg");
    const s = store();
    vi.mocked(s.details).mockResolvedValue(details);
    const send = vi.fn().mockResolvedValue({ status: 202, messageId: null });
    await dispatchPublishDelivery(key, s, send);
    expect(send.mock.calls[0]![1].html).toContain("LinkedIn caption");
    expect(send.mock.calls[0]![1].attachments).toEqual([details.preview]);
  });
  it("falls back to schedule for an unsafe or missing post link", async () => {
    const s = store();
    vi.mocked(s.details).mockResolvedValue({ email: "user@example.test", workspace: "Brand", platform: "X", caption: "Hello", permalink: "javascript:alert(1)" });
    const send = vi.fn().mockResolvedValue({ status: 202, messageId: null });
    await dispatchPublishDelivery(key, s, send);
    expect(send.mock.calls[0]![1].html).toContain("https://autosocials.com/app/schedule");
    expect(send.mock.calls[0]![1].html).not.toContain("javascript:");
  });
  it("retries provider rate limiting but never an ambiguous network or server error", async () => {
    const s = store(); const send = vi.fn().mockResolvedValueOnce({ status: 429, messageId: null }).mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ status: 503, messageId: null });
    await dispatchPublishDelivery(key, s, send);
    expect(s.finishDelivery).toHaveBeenLastCalledWith(key, expect.objectContaining({ status: "pending", next_attempt_at: expect.any(String) }));
    await dispatchPublishDelivery(key, s, send);
    expect(s.finishDelivery).toHaveBeenLastCalledWith(key, expect.objectContaining({ status: "uncertain" }));
    await dispatchPublishDelivery(key, s, send);
    expect(s.finishDelivery).toHaveBeenLastCalledWith(key, expect.objectContaining({ status: "uncertain" }));
    vi.mocked(s.claim).mockResolvedValue({ ...key, attempts: 3 });
    send.mockResolvedValueOnce({ status: 429, messageId: null });
    await dispatchPublishDelivery(key, s, send);
    expect(s.finishDelivery).toHaveBeenLastCalledWith(key, expect.objectContaining({ status: "failed" }));
  });
  it("fails closed if authorization data cannot be read", async () => {
    const s = store(); vi.mocked(s.stillEligible).mockRejectedValue(new Error("database unavailable"));
    const send = vi.fn(); await dispatchPublishDelivery(key, s, send);
    expect(send).not.toHaveBeenCalled();
    expect(s.finishDelivery).toHaveBeenCalledWith(key, expect.objectContaining({ status: "pending" }));
  });
});
