/** Validate TikTok's live creator options before showing a publishing form. */
export function creatorPostingOptions(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid creator information');
  const info = value as Record<string, unknown>;
  const allowed = new Set(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']);
  if (typeof info.creator_nickname !== 'string' || !info.creator_nickname.trim() ||
      !Array.isArray(info.privacy_level_options) || info.privacy_level_options.length === 0 ||
      !info.privacy_level_options.every(option => typeof option === 'string' && allowed.has(option)) ||
      typeof info.comment_disabled !== 'boolean' || typeof info.duet_disabled !== 'boolean' ||
      typeof info.stitch_disabled !== 'boolean' || typeof info.max_video_post_duration_sec !== 'number' ||
      !Number.isFinite(info.max_video_post_duration_sec) || info.max_video_post_duration_sec <= 0) {
    throw new Error('Invalid creator information');
  }
  return {
    creator_nickname: info.creator_nickname,
    privacy_level_options: [...new Set(info.privacy_level_options as string[])],
    comment_disabled: info.comment_disabled,
    duet_disabled: info.duet_disabled,
    stitch_disabled: info.stitch_disabled,
    max_video_post_duration_sec: info.max_video_post_duration_sec,
  };
}
