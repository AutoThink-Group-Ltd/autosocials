// Map X's expanded media by key: includes.media is not guaranteed to be ordered.
export function normalizeXPosts(result: any) {
  const media = new Map<string, any>((result.includes?.media ?? []).map((item: any) => [item.media_key, item]));
  return (result.data ?? []).map((post: any) => {
    const attachments = (post.attachments?.media_keys ?? []).map((key: string) => media.get(key)).filter(Boolean);
    const first: any = attachments[0];
    const video = first?.type === 'video' || first?.type === 'animated_gif';
    const variant = video ? (first.variants ?? []).filter((v: any) => v.content_type === 'video/mp4' && typeof v.url === 'string').sort((a: any, b: any) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]?.url : null;
    return { id: post.id, platform: 'x', caption: post.text ?? '', media_type: attachments.length > 1 ? 'carousel' : video ? 'video' : first ? 'image' : 'text', media_url: variant ?? first?.url ?? first?.preview_image_url ?? null, thumbnail_url: first?.preview_image_url ?? first?.url ?? null, permalink: `https://x.com/i/status/${encodeURIComponent(post.id)}`, timestamp: post.created_at, like_count: post.public_metrics?.like_count ?? null, comment_count: post.public_metrics?.reply_count ?? null, share_count: post.public_metrics?.retweet_count ?? null };
  });
}
