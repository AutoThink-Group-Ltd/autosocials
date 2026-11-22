// TikTok's publish ID identifies a submission, not necessarily a published video.
// Unknown or incomplete responses must never be treated as a successful post.
export type TikTokPublishStatus =
  | { kind: 'processing' }
  | { kind: 'published'; publicPostId: string | null }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' };

export function parseTikTokPublishStatus(body: unknown): TikTokPublishStatus {
  if (!body || typeof body !== 'object') return { kind: 'unknown' };
  const envelope = body as { error?: { code?: unknown }; data?: { status?: unknown; fail_reason?: unknown; publicaly_available_post_id?: unknown } };
  if (envelope.error?.code !== 'ok' || !envelope.data) return { kind: 'unknown' };
  const status = envelope.data.status;
  if (status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD') return { kind: 'processing' };
  if (status === 'PUBLISH_COMPLETE') {
    const ids = envelope.data.publicaly_available_post_id;
    const first = Array.isArray(ids) ? ids[0] : undefined;
    const publicPostId = typeof first === 'string' && /^\d+$/.test(first) ? first : null;
    return { kind: 'published', publicPostId };
  }
  if (status === 'FAILED') {
    const reason = envelope.data.fail_reason;
    return { kind: 'failed', reason: typeof reason === 'string' && /^[a-z0-9_]{1,100}$/i.test(reason) ? reason : 'unknown' };
  }
  return { kind: 'unknown' };
}
