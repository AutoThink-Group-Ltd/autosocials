import { describe, expect, it, vi } from "vitest";
import { pollHeyGenAvatar, submitHeyGenAvatar } from "./heygen-avatar.server";

describe("HeyGen avatar API", () => {
  it("uses the shared narration as the only audio source and explicitly selects Avatar III", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { video_id: "v_123", status: "waiting" } })));
    await expect(submitHeyGenAvatar({ avatarId: "look_123", audioUrl: "https://storage.example.com/audio.wav", aspectRatio: "9:16", idempotencyKey: "job_123" }, { key: "test", fetch: fetcher })).resolves.toBe("v_123");
    const request = fetcher.mock.calls[0]![1];
    expect(JSON.parse(request.body)).toEqual({ type: "avatar", avatar_id: "look_123", audio_url: "https://storage.example.com/audio.wav", aspect_ratio: "9:16", resolution: "1080p", engine: { type: "avatar_iii" } });
    expect(request.redirect).toBe("error");
    expect(request.headers["Idempotency-Key"]).toBe("job_123");
  });
  it("requires reconciliation when submission has an uncertain outcome", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    await expect(submitHeyGenAvatar({ avatarId: "look", audioUrl: "https://storage.example.com/audio.wav", aspectRatio: "9:16", idempotencyKey: "job_123" }, { key: "test", fetch: fetcher })).rejects.toMatchObject({ code: "reconciliation_required" });
  });
  it("checks the returned identity and URL before returning a completed video", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "v_123", status: "completed", video_url: "https://files.heygen.ai/a.mp4", duration: 10 } })));
    await expect(pollHeyGenAvatar("v_123", { key: "test", fetch: fetcher })).resolves.toMatchObject({ status: "completed", duration: 10 });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ data: { id: "v_123", status: "completed", video_url: "http://127.0.0.1/private", duration: 10 } })));
    await expect(pollHeyGenAvatar("v_123", { key: "test", fetch: fetcher })).rejects.toMatchObject({ code: "invalid_response" });
  });
});
