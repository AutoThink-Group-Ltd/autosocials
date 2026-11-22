import type { Block } from "@/lib/sam.blocks";

type OutreachCampaignBlock = Extract<Block, { type: "outreach_campaign" }>;

export function OutreachBlock({ block }: { block: OutreachCampaignBlock }) {
  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h3 className="font-display text-lg font-bold">{block.title}</h3>
    <p className="text-sm text-muted-foreground">Open the campaign to review creators, drafts and replies. Sending requires your confirmation of the exact batch.</p>
    <a className="inline-block rounded-lg bg-ink px-4 py-2 font-semibold text-inverse" href={`/app/outreach?campaign=${encodeURIComponent(block.campaign_id)}`}>
      Open campaign
    </a>
  </section>;
}
