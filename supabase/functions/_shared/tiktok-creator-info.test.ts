import { creatorPostingOptions } from './tiktok-creator-info.ts';

const valid = { creator_nickname: 'Creator', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 180 };

Deno.test('uses only explicitly returned creator options', () => {
  const result = creatorPostingOptions({ ...valid, privacy_level_options: ['SELF_ONLY', 'SELF_ONLY'], ignored: 'private data' });
  if (result.privacy_level_options.length !== 1 || result.comment_disabled !== true || 'ignored' in result) throw new Error('Options not restricted');
});

Deno.test('rejects incomplete, unknown, or unsafe creator options', () => {
  for (const invalid of [
    { ...valid, privacy_level_options: [] },
    { ...valid, privacy_level_options: ['UNKNOWN'] },
    { ...valid, comment_disabled: undefined },
    { ...valid, max_video_post_duration_sec: 0 },
    { ...valid, creator_nickname: '' },
  ]) {
    let rejected = false;
    try { creatorPostingOptions(invalid); } catch { rejected = true; }
    if (!rejected) throw new Error('Invalid creator options accepted');
  }
});
