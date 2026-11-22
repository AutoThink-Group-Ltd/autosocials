import type { creatorPostingOptions } from './tiktok-creator-info.ts';

type CreatorOptions = ReturnType<typeof creatorPostingOptions>;
export type TikTokPostChoices = {
  privacy: string | null;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercialDisclosure: boolean;
  promotesOwnBrand: boolean;
  brandedContent: boolean;
  durationSeconds: number | null;
  consent: boolean;
};

/** Enforce the creator's current restrictions immediately before submission. */
export function tiktokPostProblem(creator: CreatorOptions, choices: TikTokPostChoices): string | null {
  if (!choices.privacy || !creator.privacy_level_options.includes(choices.privacy)) return 'Choose an available TikTok privacy setting.';
  if (choices.durationSeconds === null || !Number.isFinite(choices.durationSeconds) || choices.durationSeconds <= 0 || choices.durationSeconds > creator.max_video_post_duration_sec) return 'The video duration is unavailable or exceeds this TikTok account’s limit.';
  if ((choices.allowComments && creator.comment_disabled) || (choices.allowDuet && creator.duet_disabled) || (choices.allowStitch && creator.stitch_disabled)) return 'One or more interactions are disabled for this TikTok account.';
  if (choices.commercialDisclosure && !choices.promotesOwnBrand && !choices.brandedContent) return 'Choose whose brand the content promotes.';
  if (!choices.commercialDisclosure && (choices.promotesOwnBrand || choices.brandedContent)) return 'Enable content disclosure before choosing a promotion type.';
  if (choices.brandedContent && choices.privacy === 'SELF_ONLY') return 'Branded content cannot be private.';
  if (!choices.consent) return 'Confirm the TikTok posting declaration before publishing.';
  return null;
}
