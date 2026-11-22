import { MODULES, type ModuleId } from "./tokens";

/** Contract every stage must register (brief §5). Missing pieces fail `validateModuleRegistry`. */
export type ModuleContract = {
  id: ModuleId;
  description: string;
  defaultPreview: string;
  snapshot: string;
  glossary: Record<string, string>;
  starters: string[];
  blocks: string[];
  actions: string[];
  available: boolean;
};

export const MODULE_CONTRACTS: Record<ModuleId, ModuleContract> = {
  create: {
    id: "create",
    description: "Create videos or five square social tiles from a business goal.",
    defaultPreview: "Current asset with playable renders and a compact brief.",
    snapshot: "dossier, current asset, variants, render jobs, generation allowance",
    glossary: { angle: "the reason to care", hook: "the opening attention cue", variant: "one version of an asset", render: "an actual video file produced by a job" },
    starters: ["Create five social tiles for my business", "Create one video for my business", "Turn this product feature into a video"],
    blocks: ["virlo_action", "virlo_research", "youtube_gallery", "heading", "text", "brief", "variants", "table", "checklist", "notice", "assets", "document", "palette", "type_specimen", "compare", "shotlist", "storyboard", "confirm", "direct_video", "social_tiles", "content_campaign"],
    actions: ["create_batch", "edit_variant", "submit_render", "retry_render", "select_for_publish"],
    available: true,
  },
  schedule: {
    id: "schedule",
    description: "Plan and publish social content from your assets or uploads.",
    defaultPreview: "Visual social planner alongside real connected account feeds.",
    snapshot: "connected accounts, queue, workspace timezone, recent failures",
    glossary: { scheduled: "stored future work", submitted: "sent to the platform", published: "confirmed by the platform", failed: "a known unsuccessful attempt" },
    starters: ["Schedule this batch", "Keep my accounts active this week", "Show anything that failed to publish"],
    blocks: ["virlo_action", "virlo_research", "youtube_gallery", "heading", "text", "schedule", "table", "checklist", "notice", "assets", "document", "confirm"],
    actions: ["create_draft", "schedule", "reschedule", "cancel", "retry_safe_failure"],
    available: true,
  },
  winners: {
    id: "winners",
    description: "See which organic posts stand out, learn from the evidence and prepare candidates for paid testing.",
    defaultPreview: "Post performance and evidence-backed findings.",
    snapshot: "connected account posts, comparable performance and active findings",
    glossary: { cohort: "comparable posts", confidence: "completeness of evidence, not a probability" },
    starters: ["Which videos should we test with ads?", "Why did Sam select this video?"],
    blocks: ["virlo_action", "virlo_research", "youtube_gallery", "heading", "text", "table", "notice", "assets", "document", "compare"],
    actions: ["sync_accounts", "select_for_paid_testing", "dismiss_finding"],
    available: true,
  },
  campaigns: {
    id: "campaigns",
    description: "Build and operate paid tests around selected organic creatives.",
    defaultPreview: "Campaign drafts — requires a connected ad account.",
    snapshot: "ad account connection status",
    glossary: { "paid test": "a bounded campaign experiment", budget: "permitted spend" },
    starters: ["Plan a paid test for my best video"],
    blocks: ["virlo_action", "virlo_research", "youtube_gallery", "heading", "text", "brief", "checklist", "notice", "assets", "document"],
    actions: [],
    available: false,
  },
  outreach: {
    id: "outreach",
    description: "Find relevant creators and review personal outreach before sending.",
    defaultPreview: "Creator campaigns and replies.",
    snapshot: "campaigns, shortlisted creators, drafts, queued messages and replies",
    glossary: { campaign: "a creator outreach initiative", shortlist: "creators selected for review" },
    starters: ["Help me plan a creator outreach campaign", "Review my creator shortlist"],
    blocks: ["outreach_campaign", "virlo_research", "virlo_action", "heading", "text", "table", "notice", "checklist", "confirm"],
    actions: ["create_campaign", "review_creators", "prepare_draft"],
    available: true,
  },
  learn: {
    id: "learn",
    description: "Turn results into findings that shape the next batch.",
    defaultPreview: "Findings — appear once tests have results.",
    snapshot: "dossier and past batches",
    glossary: { finding: "a lesson backed by results" },
    starters: ["What should the next batch try?"],
    blocks: ["virlo_action", "virlo_research", "youtube_gallery", "heading", "text", "checklist", "notice", "assets", "document"],
    actions: [],
    available: false,
  },
};

export function validateModuleRegistry(contracts: Record<string, ModuleContract> = MODULE_CONTRACTS): string[] {
  const errors: string[] = [];
  for (const m of MODULES) {
    const c = contracts[m.id];
    if (!c) { errors.push(`${m.id}: missing contract`); continue; }
    if (!c.description) errors.push(`${m.id}: description`);
    if (!c.defaultPreview) errors.push(`${m.id}: defaultPreview`);
    if (!c.snapshot) errors.push(`${m.id}: snapshot`);
    if (!Object.keys(c.glossary).length) errors.push(`${m.id}: glossary`);
    if (!c.starters.length) errors.push(`${m.id}: starters`);
    if (!c.blocks.length) errors.push(`${m.id}: blocks`);
    if (c.available && !c.actions.length) errors.push(`${m.id}: actions`);
  }
  return errors;
}
