import { createHash } from 'node:crypto';
import { fetchPersonalImage } from './personal-brand-media.server';
import { getAdminClient } from './supabase-admin.server';

/** Store bounded, validated public thumbnails privately; never persist provider URLs. */
export async function cacheLinkedInCover(workspaceId: string, url: string | null): Promise<string | null> {
  if (!url) return null;
  const image = await fetchPersonalImage(url);
  if (!image) return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) return null;
  const bytes = Buffer.from(match[2]!, 'base64');
  if (!bytes.length || bytes.length > 700_000) return null;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const path = `${workspaceId}/social-previews/linkedin/${digest}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  const bucket = getAdminClient().storage.from('brand-assets-private');
  const { error } = await bucket.upload(path, bytes, { contentType: `image/${match[1]}`, upsert: false });
  if (error) {
    const existing = await bucket.exists(path);
    if (existing.error || !existing.data) return null;
  }
  return path;
}
