import { afterEach, describe, expect, it, vi } from "vitest";
import { publishX } from "../../supabase/functions/publish-scheduled-posts/x-publisher";

const base = "https://project.supabase.co";
const image = { kind: "image", mime: "image/jpeg", url: `${base}/storage/v1/object/sign/post-media/workspace/image?token=test` };
const account = { access_token: "test-token" };
const okJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("X publishing", () => {
  it("uploads media using v2 multipart, then checkpoints before creating the post", async () => {
    const events: string[] = [];
    const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(base) && init?.method === "HEAD") return new Response(null, { headers: { "content-length": "3" } });
      if (url.startsWith(base)) {
        expect(new Headers(init?.headers).get("range")).toBe("bytes=0-2");
        return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-length": "3", "content-range": "bytes 0-2/3" } });
      }
      if (url.endsWith("/initialize")) {
        expect(JSON.parse(String(init?.body))).toEqual({ media_type: "image/jpeg", total_bytes: 3, media_category: "tweet_image" });
        return okJson({ data: { id: "123" } });
      }
      if (url.endsWith("/123/append")) {
        const form = init?.body as FormData;
        expect(form.get("segment_index")).toBe("0");
        expect((form.get("media") as Blob).size).toBe(3);
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/123/finalize")) return okJson({ data: { id: "123" } });
      if (url.endsWith("/2/tweets")) {
        events.push("post");
        expect(JSON.parse(String(init?.body))).toEqual({ text: "hello", media: { media_ids: ["123"] } });
        return okJson({ data: { id: "456" } });
      }
      throw Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", mock);
    const result = await publishX(account, { caption: "hello" }, [image], { checkpoint: async patch => { expect(patch["submission_started_at"]).toBeTruthy(); events.push("checkpoint"); } }, base);
    expect(events).toEqual(["checkpoint", "post"]);
    expect(result).toEqual({ id: "456", permalink: "https://x.com/i/status/456" });
  });

  it("never creates a post if the submission checkpoint fails", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    await expect(publishX(account, { caption: "hello" }, [], { checkpoint: async () => { throw Error("lost lease"); } }, base)).rejects.toThrow("lost lease");
    expect(mock).not.toHaveBeenCalled();
  });

  it("treats an unconfirmed post response as non-definitive", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ data: {} })));
    await expect(publishX(account, { caption: "hello" }, [], { checkpoint: async () => {} }, base)).rejects.toMatchObject({ definitive: false, retryable: false });
  });

  it("rejects an incorrect storage range before uploading or posting", async () => {
    const mock = vi.fn(async (_url, init) => init?.method === "HEAD"
      ? new Response(null, { headers: { "content-length": "3" } })
      : new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-length": "3", "content-range": "bytes 1-3/4" } }));
    vi.stubGlobal("fetch", mock);
    // Initialize succeeds before storage data is read.
    mock.mockImplementation(async (url, init) => String(url).endsWith("/initialize") ? okJson({ data: { id: "123" } }) : init?.method === "HEAD" ? new Response(null, { headers: { "content-length": "3" } }) : new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-length": "3", "content-range": "bytes 1-3/4" } }));
    const checkpoint = vi.fn();
    await expect(publishX(account, { caption: "hello" }, [image], { checkpoint }, base)).rejects.toThrow("invalid chunk size");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(mock.mock.calls.some(([url]) => String(url).endsWith("/2/tweets"))).toBe(false);
  });

  it("rejects mixed video and images before any request", async () => {
    const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    await expect(publishX(account, { caption: "hello" }, [image, { ...image, kind: "video", mime: "video/mp4" }], { checkpoint: async () => {} }, base)).rejects.toThrow("one video");
    expect(mock).not.toHaveBeenCalled();
  });
});


