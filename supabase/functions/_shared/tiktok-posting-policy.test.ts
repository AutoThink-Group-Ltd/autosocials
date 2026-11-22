import { tiktokPostProblem, type TikTokPostChoices } from './tiktok-posting-policy.ts';

const creator = { creator_nickname: 'Creator', privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], comment_disabled: false, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 120 };
const choices: TikTokPostChoices = { privacy: 'PUBLIC_TO_EVERYONE', allowComments: false, allowDuet: false, allowStitch: false, commercialDisclosure: false, promotesOwnBrand: false, brandedContent: false, durationSeconds: 60, consent: true };

Deno.test('accepts an explicit permitted, consented video', () => {
  if (tiktokPostProblem(creator, choices) !== null) throw new Error('Valid post was rejected');
});

Deno.test('rejects unavailable privacy, missing duration, disabled interactions and missing consent', () => {
  for (const update of [{ privacy: null }, { privacy: 'MUTUAL_FOLLOW_FRIENDS' }, { durationSeconds: null }, { durationSeconds: 121 }, { allowDuet: true }, { consent: false }]) {
    if (!tiktokPostProblem(creator, { ...choices, ...update })) throw new Error('Unsafe post was accepted');
  }
});

Deno.test('requires consistent commercial disclosure and blocks private branded content', () => {
  for (const update of [
    { commercialDisclosure: true },
    { brandedContent: true },
    { commercialDisclosure: true, brandedContent: true, privacy: 'SELF_ONLY' },
  ]) if (!tiktokPostProblem(creator, { ...choices, ...update })) throw new Error('Invalid disclosure was accepted');
  if (tiktokPostProblem(creator, { ...choices, commercialDisclosure: true, promotesOwnBrand: true })) throw new Error('Valid disclosure was rejected');
});
