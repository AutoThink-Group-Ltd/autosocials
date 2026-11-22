import type { ContentCampaign } from "./content-campaign";

/** Select the same ordered production chunk on quote, submission and recovery. */
export function campaignProductionPosts(campaign: ContentCampaign, offset: number) {
  return campaign.posts.filter((post) => post.format === "tiles" || post.format === "written").slice(offset, offset + 20);
}
