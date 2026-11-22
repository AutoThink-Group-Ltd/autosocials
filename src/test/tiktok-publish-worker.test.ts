import { describe, expect, it, vi } from 'vitest';
import { initializeTikTokPublish } from '../../supabase/functions/publish-scheduled-posts/tiktok-publisher.ts';

const choices = { privacy: 'SELF_ONLY', allowComments: false, allowDuet: false, allowStitch: false, commercialDisclosure: false, promotesOwnBrand: false, brandedContent: false, durationSeconds: 5, consent: true };
const media = [{ kind: 'video', duration_ms: 5000, tiktokUrl: 'https://autosocials.com/api/public/tiktok-media?token=capability' }];
const creator = { creator_nickname: 'Creator', privacy_level_options: ['SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 60 };
const body = (data: unknown) => new Response(JSON.stringify(data));

describe('TikTok submission', () => {
  it('checks creator options and checkpoints before init, then persists the publish ID', async () => {
    const events: string[] = [];
    const request = vi.fn(async (url: string | URL | Request) => {
      const info = String(url).includes('creator_info'); events.push(info ? 'creator' : 'init');
      return body(info ? { error: { code: 'ok' }, data: creator } : { error: { code: 'ok' }, data: { publish_id: 'id' } });
    });
    const checkpoint = vi.fn(async (patch: Record<string, unknown>) => { events.push(patch.submission_started_at ? 'started' : 'id'); });
    expect(await initializeTikTokPublish('token', {}, choices, media, { checkpoint }, request)).toBe('id');
    expect(events).toEqual(['creator', 'started', 'init', 'id']);
  });
  it('rejects missing consent before any submission', async () => {
    const request = vi.fn(async () => body({ error: { code: 'ok' }, data: creator }));
    const checkpoint = vi.fn();
    await expect(initializeTikTokPublish('token', {}, { ...choices, consent: false }, media, { checkpoint }, request)).rejects.toThrow('declaration');
    expect(checkpoint).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps the started checkpoint when the initialization response is lost', async () => {
    const checkpoint = vi.fn();
    const request = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('creator_info')) return body({ error: { code: 'ok' }, data: creator });
      throw new Error('network');
    });
    await expect(initializeTikTokPublish('token', {}, choices, media, { checkpoint }, request)).rejects.toThrow();
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(checkpoint.mock.calls[0][0]).toHaveProperty('submission_started_at');
  });
});


import { canPollTikTokAgain, reconcileTikTokPublish } from "../../supabase/functions/publish-scheduled-posts/tiktok-reconcile.ts";

describe("TikTok delivery reconciliation", () => {
  it("queries the saved submission and only confirms provider completion", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "ok" }, data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["123"] } }), { status: 200 }));
    expect(await reconcileTikTokPublish("secret", "v_pub_123", request)).toEqual({ kind: "published", publicPostId: "123" });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ publish_id: "v_pub_123" });
    expect(request.mock.calls[0][0]).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
  });
  it("keeps processing distinct and treats malformed or unavailable responses as unknown", async () => {
    const response = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    expect((await reconcileTikTokPublish("token", "id", response({ error: { code: "ok" }, data: { status: "PROCESSING_DOWNLOAD" } }))).kind).toBe("processing");
    expect((await reconcileTikTokPublish("token", "id", response({ data: { status: "PUBLISH_COMPLETE" } }))).kind).toBe("unknown");
    expect((await reconcileTikTokPublish("token", "id", vi.fn().mockRejectedValue(new Error("network")))).kind).toBe("unknown");
    expect((await reconcileTikTokPublish("token", "", vi.fn())).kind).toBe("unknown");
  });
});

it("bounds status-only polling to 24 hours", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  expect(canPollTikTokAgain("2026-11-13T12:00:01Z", now)).toBe(true);
  expect(canPollTikTokAgain("2026-11-13T12:00:00Z", now)).toBe(false);
  expect(canPollTikTokAgain("invalid", now)).toBe(false);
  expect(canPollTikTokAgain("2026-11-14T12:00:01Z", now)).toBe(false);
});
