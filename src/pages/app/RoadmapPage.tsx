import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import AgentAccessSprint from "@/features/admin/AgentAccessSprint";
import {
  Sparkles,
  Calendar,
  Handshake,
  TrendingUp,
  Inbox,
  Radar,
  BarChart3,
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  Lightbulb,
  FolderOpen,
  ShoppingBag,
  LineChart,
  Star,
} from "lucide-react";

/**
 * AutoSocials — Master Build Roadmap.
 *
 * Single source of truth for the agentic-social product vision.
 * Six core pillars, each broken into phases. We build one engine at a time,
 * fully shipped before moving on.
 */

type PhaseStatus = "done" | "in_progress" | "todo";

interface Phase {
  id: string;
  title: string;
  status: PhaseStatus;
  goal: string;
  deliverables: string[];
  exit: string; // exit criteria — how we know the phase is done
}

interface Pillar {
  id: string;
  number: number;
  title: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  status: PhaseStatus;
  why: string;
  competitors: string;
  phases: Phase[];
}

const PILLARS: Pillar[] = [
  {
    id: "agency-leads",
    number: 12,
    title: "Agency leads and offers",
    tagline: "Create content for a lead, share an offer, and track their response.",
    icon: Handshake,
    status: "in_progress",
    why: "Agencies can show prospective clients what they would make before asking them to commit.",
    competitors: "AutoScribble agency leads are the product reference.",
    phases: [
      { id: "agency-lead-workspace", title: "Lead intake and creation workspace", status: "in_progress", goal: "Support company leads and personal LinkedIn leads.", deliverables: ["Add a lead and open its private workspace", "Build Profile DNA from public evidence and keep company Brand DNA separate"], exit: "Local workspace creation and existing LinkedIn evidence tests pass. Verify discovery against a real profile after release." },
      { id: "agency-lead-offer", title: "Offer terms and shareable samples", status: "in_progress", goal: "Show the lead what they would get and at what price.", deliverables: ["Select finished samples and enter offer terms", "Copy or revoke an unlisted offer link", "Show invoice and delivery steps after acceptance"], exit: "Offer creation and sharing are implemented locally. Verify all sample formats and the recipient page after release." },
      { id: "agency-lead-response", title: "Offer engagement and response", status: "in_progress", goal: "Give the agency visibility into engagement.", deliverables: ["Track link views and sample clicks", "Record accept or decline and show the response on the lead"], exit: "Local database checks cover deduplication, recording one decision, and revocation. Verify the activity display after release." },
    ],
  },
  // ───────────────────────── PILLAR 1 — PUBLISHING ─────────────────────────
  {
    id: "publishing",
    number: 1,
    title: "Publishing & Scheduling",
    tagline: "Plan, draft, schedule and post content across Facebook Pages, Instagram and TikTok.",
    icon: Calendar,
    status: "in_progress",
    why: "Every social team's #1 weekly ritual. Owning the calendar locks us into the daily workflow and unlocks AI-native ideation, repurposing and approval.",
    competitors: "Buffer, Later, Hootsuite, Sprout, Metricool, Planable.",
    phases: [
      {
        id: "p1-foundations",
        title: "Phase 1 — Account connections & foundations ✅",
        status: "done",
        goal: "Connect a brand's Facebook Page, Instagram Business account and TikTok Business account through official Graph & TikTok APIs.",
        deliverables: [
          "OAuth flow for Meta (Facebook + Instagram via Graph API)",
          "OAuth flow for TikTok Content Posting API",
          "`social_accounts` table (workspace_id, platform, external_id, tokens, scopes, expires_at)",
          "Connected Accounts page at /app/settings/connections",
          "OAuth state table for safe round-trips",
        ],
        exit: "Shipped. Users can connect/disconnect Meta and TikTok accounts; tokens stored with expiry and status.",
      },
      {
        id: "p1-composer",
        title: "Phase 2 — Universal composer ✅",
        status: "done",
        goal: "One composer that adapts to each platform's format rules (image, carousel, Reel, Story, TikTok video).",
        deliverables: [
          "Media uploader with Lovable Cloud storage bucket",
          "Per-platform validation (aspect ratio, duration, caption length)",
          "Live preview cards for each platform",
          "Caption + first comment + hashtag fields",
          "Save as draft + Vibe-assisted caption generation",
        ],
        exit: "User can author one post and see accurate previews for FB, IG and TikTok.",
      },
      {
        id: "p1-scheduler",
        title: "Phase 3 — Scheduler & calendar ✅",
        status: "done",
        goal: "Queue posts to publish at a future date/time with reliable delivery.",
        deliverables: [
          "`scheduled_posts` table + status state machine",
          "Cron-triggered edge function (`publish-scheduled-posts`) running every minute",
          "Calendar view (month/week) with drag-to-reschedule",
          "Best-time-to-post suggestions (Vibe skill)",
          "Failure handling + retry + user notification",
        ],
        exit: "A post scheduled for a future minute publishes within 60s of its slot, with traceable success/failure.",
      },
      {
        id: "p1-approval",
        title: "Phase 4 — Approval workflows & teams ✅",
        status: "done",
        goal: "Agency / team approval gates before anything goes live.",
        deliverables: [
          "Roles: editor, approver, admin",
          "Approval queue page + email notification",
          "Comment threads on draft posts",
          "Audit log of who approved what",
        ],
        exit: "An editor can submit, an approver gets notified, approves or rejects, and only approved posts publish.",
      },
      {
        id: "p1-agentic",
        title: "Phase 5 — Agentic publishing (Vibe-driven) ✅",
        status: "done",
        goal: "Tell Vibe what you want and it produces a full week of content.",
        deliverables: [
          "`publishing.plan_week` skill",
          "`publishing.repurpose_post` skill (TikTok → Reel → carousel)",
          "Bulk schedule from a content brief",
          "Hashtag + sound recommendation tools",
        ],
        exit: "User says \"plan next week of posts for my brand\" and gets a draft calendar to approve in one click.",
      },
    ],
  },

  // ───────────────────────── PILLAR 2 — OUTREACH (CURRENT) ─────────────────────────
  {
    id: "outreach",
    number: 2,
    title: "Creator Outreach & Collaborations",
    tagline: "Discover, enrich and outreach to UGC creators for paid and organic collaborations.",
    icon: Handshake,
    status: "in_progress",
    why: "Our beachhead. Already shipped through to bulk outreach, replies, deliverability and commissions. Continues to evolve as the agentic creator-marketing engine.",
    competitors: "Modash, Aspire, Grin, Upfluence, Heepsy.",
    phases: [
      {
        id: "p2-discovery",
        title: "Phase 1 — Discovery & enrichment ✅",
        status: "done",
        goal: "Find, filter and enrich TikTok + Instagram creators on demand.",
        deliverables: [
          "Hybrid scanning pipeline (DB → external → AI fallback)",
          "Cross-platform profile linking",
          "Lists, exclusions, bulk selection",
        ],
        exit: "Shipped.",
      },
      {
        id: "p2-outreach",
        title: "Phase 2 — Outreach engine ✅",
        status: "done",
        goal: "Send personalised emails at scale with deliverability safety.",
        deliverables: [
          "3-step bulk outreach wizard",
          "SendGrid subuser provisioning, domain auth, signatures",
          "Send caps + warmup tiers",
          "AI auto-reply drafts",
        ],
        exit: "Shipped.",
      },
      {
        id: "p2-pipeline",
        title: "Phase 3 — Collaboration pipeline ✅",
        status: "done",
        goal: "Track every creator from outreach to delivered content to paid commission.",
        deliverables: [
          "Kanban collaboration board",
          "Commission settings + per-creator overrides",
          "Insights & deliverability reporting",
        ],
        exit: "Shipped.",
      },
      {
        id: "p2-content-rights",
        title: "Phase 4 — Content collection & rights",
        status: "todo",
        goal: "Receive, store and licence the actual UGC content the creator delivers.",
        deliverables: [
          "Creator upload portal (link sent in outreach)",
          "Storage bucket per workspace + watermark detection",
          "Usage rights agreement + e-signature",
          "Content library tied to each collaboration",
        ],
        exit: "A creator can upload deliverables and the brand can see, approve and download with rights attached.",
      },
      {
        id: "p2-payments",
        title: "Phase 5 — Creator payments",
        status: "todo",
        goal: "Pay creators directly through the platform.",
        deliverables: [
          "Stripe Connect onboarding for creators",
          "Payout per collaboration milestone",
          "Tax form collection (W-9 / W-8BEN)",
          "Statement page for creators",
        ],
        exit: "Brand can pay a creator with one click and the creator sees the payout land.",
      },
    ],
  },

  // ───────────────────────── PILLAR 3 — PAID ADS ─────────────────────────
  {
    id: "paid",
    number: 3,
    title: "Paid Social Performance",
    tagline: "Plan, launch and performance-manage paid campaigns across Meta and TikTok.",
    icon: TrendingUp,
    status: "todo",
    why: "The single biggest budget line for any brand on social. Closing the loop between organic creator content and paid amplification is where AutoSocials becomes a category-defining product.",
    competitors: "Madgicx, Smartly.io, Revealbot, AdEspresso, Triple Whale.",
    phases: [
      {
        id: "p3-connect",
        title: "Phase 1 — Ad account connections & read-only reporting",
        status: "todo",
        goal: "Connect Meta Ads + TikTok Ads accounts and pull spend/results into AutoSocials.",
        deliverables: [
          "Meta Marketing API OAuth + ad account selection",
          "TikTok Marketing API OAuth + ad account selection",
          "Nightly sync of campaigns / ad sets / ads / metrics",
          "Unified spend dashboard (ROAS, CPA, CTR, CPM)",
        ],
        exit: "User connects ad accounts and sees a unified spend view within 5 minutes.",
      },
      {
        id: "p3-creative",
        title: "Phase 2 — Creative library & boost-from-organic",
        status: "todo",
        goal: "Promote organic posts and creator content as paid ads with one click.",
        deliverables: [
          "Pull organic posts from Pillar 1 into ad creative library",
          "Pull creator-licensed UGC from Pillar 2 into ad creative library",
          "Boost-this-post action with audience + budget defaults",
          "Whitelisted / spark ads support (TikTok Spark, Meta Branded Content)",
        ],
        exit: "User can take any organic post or licensed UGC and launch a paid ad in under 60s.",
      },
      {
        id: "p3-launch",
        title: "Phase 3 — Campaign launch & structure",
        status: "todo",
        goal: "Launch full campaigns (objective → ad sets → ads) without leaving AutoSocials.",
        deliverables: [
          "Campaign builder for Meta + TikTok",
          "Audience builder (saved audiences, lookalikes, custom)",
          "Budget pacing + bid strategy",
          "Approval gate before any spend goes live",
        ],
        exit: "User launches a real Meta + TikTok campaign end-to-end through AutoSocials.",
      },
      {
        id: "p3-optimisation",
        title: "Phase 4 — Agentic performance management",
        status: "todo",
        goal: "Vibe watches campaigns 24/7 and proposes/executes optimisations.",
        deliverables: [
          "`paid.detect_underperformers` skill (rule + LLM hybrid)",
          "`paid.scale_winners` skill",
          "`paid.creative_fatigue` detector",
          "Auto-pause / auto-scale workflows with approval gate",
          "Daily performance briefing in Vibe chat",
        ],
        exit: "User wakes up to a Vibe briefing: \"3 ads scaled, 2 paused, 1 needs your approval\".",
      },
      {
        id: "p3-reporting",
        title: "Phase 5 — Cross-channel attribution & client reports",
        status: "todo",
        goal: "Tie paid spend back to revenue and report it cleanly.",
        deliverables: [
          "Pixel/Capi healthchecks for Meta + TikTok",
          "Shopify / Stripe revenue connector",
          "Blended ROAS report (paid + organic + creator)",
          "Client-facing scheduled reports (extends agency reporting)",
        ],
        exit: "Agency can send a fully blended weekly performance report to a client in one click.",
      },
    ],
  },

  // ───────────────────────── PILLAR 4 — INBOX ─────────────────────────
  {
    id: "inbox",
    number: 4,
    title: "Community Inbox & Engagement",
    tagline: "Reply to comments, DMs, mentions, tags, reviews and story replies in one unified inbox.",
    icon: Inbox,
    status: "todo",
    why: "The #1 daily activity for social teams. Replying fast and on-brand drives reach, conversion and loyalty — and is the perfect job for an agent.",
    competitors: "Sprout Social, Hootsuite Inbox, Brand24, Sparkcentral.",
    phases: [
      {
        id: "p4-ingest",
        title: "Phase 1 — Unified ingestion",
        status: "todo",
        goal: "Pull every comment, DM and mention from connected accounts into one inbox.",
        deliverables: [
          "Webhook subscription to Meta Page/IG (comments, mentions, messages)",
          "TikTok comments + DMs polling fallback",
          "`social_conversations` + `social_messages` tables",
          "Realtime updates via Supabase Realtime",
        ],
        exit: "New comment on a connected IG post appears in inbox within 30s.",
      },
      {
        id: "p4-triage",
        title: "Phase 2 — Triage & assignment",
        status: "todo",
        goal: "Sort the inbox by intent, sentiment and urgency; assign to teammates.",
        deliverables: [
          "Intent classifier (question, complaint, sale-intent, spam, praise)",
          "Sentiment + urgency scoring",
          "Assignment + status (open, snoozed, closed)",
          "Saved views + filters",
        ],
        exit: "User opens the inbox to a triaged, prioritised list, not a raw feed.",
      },
      {
        id: "p4-reply",
        title: "Phase 3 — Replying & macros",
        status: "todo",
        goal: "Reply to anything from inside AutoSocials with brand-voice macros and AI drafts.",
        deliverables: [
          "Reply composer per platform with native formatting",
          "Saved replies / macros",
          "Vibe-drafted replies using brand voice",
          "Bulk approve + send",
        ],
        exit: "User can clear 100 comments in 5 minutes.",
      },
      {
        id: "p4-agentic",
        title: "Phase 4 — Agentic auto-reply",
        status: "todo",
        goal: "Vibe handles low-risk replies automatically; humans approve the rest.",
        deliverables: [
          "Rules: auto-reply to FAQs, route complaints to human",
          "Per-account confidence threshold + safety guardrails",
          "Full approval audit (extends agent traces)",
          "Escalation to a teammate via inbox or Slack",
        ],
        exit: "Brand can leave the inbox unattended for a day and Vibe handles 60%+ on its own with zero brand-safety incidents.",
      },
    ],
  },

  // ───────────────────────── PILLAR 5 — LISTENING ─────────────────────────
  {
    id: "listening",
    number: 5,
    title: "Listening & Monitoring",
    tagline: "Track brand mentions, hashtags, competitors, sentiment, share-of-voice and trends — even when not tagged.",
    icon: Radar,
    status: "todo",
    why: "Turns AutoSocials from \"what we did\" into \"what's happening to us\" — including crisis detection and competitive intel.",
    competitors: "Brandwatch, Meltwater, Sprinklr, Talkwalker.",
    phases: [
      {
        id: "p5-tracking",
        title: "Phase 1 — Track & store mentions",
        status: "todo",
        goal: "Track keywords, hashtags and brand handles across TikTok, Instagram and the open web.",
        deliverables: [
          "Topic tracker config (keywords, hashtags, accounts, languages, regions)",
          "Ingestion job per source (TikTok search, IG hashtag, web/news)",
          "`mentions` table + dedupe + media archive",
          "Mentions feed UI",
        ],
        exit: "User adds a brand keyword and sees mentions populating within 1 hour.",
      },
      {
        id: "p5-intel",
        title: "Phase 2 — Sentiment, share-of-voice & competitors",
        status: "todo",
        goal: "Turn raw mentions into intel.",
        deliverables: [
          "LLM-based sentiment per mention",
          "Share-of-voice vs configured competitors",
          "Topic clustering + trend detection",
          "Competitive benchmark dashboard",
        ],
        exit: "User can answer \"are we trending up or down vs Competitor X this week?\" in one screen.",
      },
      {
        id: "p5-alerts",
        title: "Phase 3 — Alerts & crisis detection",
        status: "todo",
        goal: "Catch spikes, sentiment drops and crises before they explode.",
        deliverables: [
          "Volume + sentiment anomaly detector",
          "Severity tiers + escalation rules",
          "Email + push + inbox alerts",
          "Crisis war-room view",
        ],
        exit: "A 3x mention spike with negative sentiment triggers a high-severity alert within 10 minutes.",
      },
      {
        id: "p5-agentic",
        title: "Phase 4 — Agentic insights",
        status: "todo",
        goal: "Vibe surfaces what matters without being asked.",
        deliverables: [
          "Daily \"what's new\" briefing",
          "Auto-suggested content topics from trending mentions",
          "Auto-suggested creator outreach from organic advocates (loops back to Pillar 2)",
        ],
        exit: "User opens the app to a Vibe briefing card: \"Sentiment up 12%, 3 organic advocates worth reaching out to, 1 trend you should post on today.\"",
      },
    ],
  },

  // ───────────────────────── PILLAR 6 — ANALYTICS ─────────────────────────
  {
    id: "analytics",
    number: 6,
    title: "Analytics & Reporting",
    tagline: "One unified analytics layer across publishing, outreach, paid, inbox and listening.",
    icon: BarChart3,
    status: "todo",
    why: "Every other pillar produces signal. This pillar makes it legible, scheduleable and shareable — internally and to clients.",
    competitors: "Sprout, Iconosquare, Dash Hudson, Northbeam (blended).",
    phases: [
      {
        id: "p6-warehouse",
        title: "Phase 1 — Metrics warehouse",
        status: "todo",
        goal: "Single normalized metrics store across every pillar.",
        deliverables: [
          "`metrics_daily` table (workspace, source, entity, metric, value, date)",
          "Daily ETL job per pillar",
          "Backfill jobs",
        ],
        exit: "Every pillar writes daily into one table with the same shape.",
      },
      {
        id: "p6-dashboards",
        title: "Phase 2 — Dashboards",
        status: "todo",
        goal: "Self-serve dashboards per pillar + an exec overview.",
        deliverables: [
          "Pillar dashboards (publishing, outreach, paid, inbox, listening)",
          "Exec overview (north-star + per-pillar tiles)",
          "Date range + comparison + segment filters",
        ],
        exit: "User can answer any single-metric question in <10s.",
      },
      {
        id: "p6-reporting",
        title: "Phase 3 — Scheduled reports & client portals",
        status: "todo",
        goal: "Build on existing Agency Reporting to cover all 6 pillars.",
        deliverables: [
          "Report builder (drag widgets, choose pillars)",
          "Scheduled email delivery",
          "Public client report links (extends current PublicAgencyReportPage)",
          "White-label theming",
        ],
        exit: "Agency can send a 6-pillar weekly client report on autopilot.",
      },
      {
        id: "p6-agentic",
        title: "Phase 4 — Agentic analytics (Ask Vibe Analytics)",
        status: "todo",
        goal: "Ask Vibe any question of the data and get a chart + commentary.",
        deliverables: [
          "Text-to-metric query layer (validated SQL on the warehouse)",
          "Chart + commentary in chat (uses the ai-chat block renderer)",
          "Auto-insight digest (anomalies, wins, losses)",
        ],
        exit: "User says \"why was last week down?\" and gets a real, sourced answer.",
      },
    ],
  },

  // ───────────────────────── PILLAR 7 — CONTENT IDEATION ─────────────────────────
  {
    id: "ideation",
    number: 7,
    title: "Content Ideation & Creation",
    tagline: "Trend discovery, hook generation, captions, hashtags and AI image/video — feeding every other pillar.",
    icon: Lightbulb,
    status: "todo",
    why: "The upstream feeder for Publishing, Outreach, Paid and Inbox. Treated as a cross-cutting Vibe skill set, not a destination — every pillar pulls from it.",
    competitors: "Jasper, Copy.ai, Predis, ContentStudio, Opus Clip.",
    phases: [
      {
        id: "p7-trends",
        title: "Phase 1 — Trend & hook discovery",
        status: "todo",
        goal: "Surface what's working right now in the brand's niche.",
        deliverables: [
          "TikTok / IG trending sound + hashtag scanner",
          "Niche-scoped \"top performing posts this week\" feed",
          "Hook library tied to brand voice",
        ],
        exit: "User opens Ideation and sees 10 fresh, niche-relevant ideas with rationale.",
      },
      {
        id: "p7-copy",
        title: "Phase 2 — Caption, hashtag & script generation",
        status: "todo",
        goal: "On-brand copy for any platform in seconds.",
        deliverables: [
          "`content.draft_caption` skill (per platform tone)",
          "`content.suggest_hashtags` skill",
          "`content.script_video` skill (TikTok/Reels structure)",
          "Brand-voice training from existing posts",
        ],
        exit: "Vibe drafts a caption that requires <2 edits to publish.",
      },
      {
        id: "p7-visual",
        title: "Phase 3 — AI image & video creation",
        status: "todo",
        goal: "Generate native visual assets without leaving AutoSocials.",
        deliverables: [
          "Image generation (Gemini/GPT image) with brand kit constraints",
          "Short-form video generation + auto-captioning",
          "Repurpose long-form to clips (Opus-style)",
          "Direct hand-off to Publishing composer",
        ],
        exit: "User goes from idea → finished post in under 5 minutes.",
      },
    ],
  },

  // ───────────────────────── PILLAR 8 — DAM ─────────────────────────
  {
    id: "dam",
    number: 8,
    title: "Asset Library & Brand Kit (DAM)",
    tagline: "Central media library, brand kits, approval workflows and version history.",
    icon: FolderOpen,
    status: "todo",
    why: "Every pillar produces or consumes assets. A first-class DAM stops them sprawling across drives and keeps brand integrity.",
    competitors: "Bynder, Frontify, Air, Brandfolder, Notion.",
    phases: [
      {
        id: "p8-library",
        title: "Phase 1 — Asset library",
        status: "todo",
        goal: "One searchable home for every image, video and document.",
        deliverables: [
          "Storage bucket per workspace + folder hierarchy",
          "Upload, tag, search, filter (by type, date, campaign, creator)",
          "Version history with rollback",
        ],
        exit: "User finds any asset they own in <10s.",
      },
      {
        id: "p8-brandkit",
        title: "Phase 2 — Brand kit",
        status: "todo",
        goal: "Define and enforce brand colours, fonts, logos and templates.",
        deliverables: [
          "Brand kit editor (logos, palette, fonts, voice)",
          "Auto-applied to AI generations and templates",
          "Read by Publishing, Ideation and Reporting",
        ],
        exit: "Anything generated automatically respects brand kit constraints.",
      },
      {
        id: "p8-rights",
        title: "Phase 3 — Rights, approvals & expiry",
        status: "todo",
        goal: "Track usage rights and approval state per asset.",
        deliverables: [
          "Per-asset licence + expiry date + source",
          "Approval workflow integrated with Publishing approvals",
          "Expiry alerts before paid/organic use",
        ],
        exit: "An expired-rights asset is blocked from being scheduled or boosted.",
      },
    ],
  },

  // ───────────────────────── PILLAR 9 — SOCIAL COMMERCE ─────────────────────────
  {
    id: "commerce",
    number: 9,
    title: "Social Commerce",
    tagline: "Product tagging, Instagram/TikTok Shop sync, link-in-bio and conversion tracking.",
    icon: ShoppingBag,
    status: "todo",
    why: "Closes the loop between content and revenue for DTC brands — the most defensible attribution story in social.",
    competitors: "Linktree, Beacons, Shopify Collabs, Later Link in Bio.",
    phases: [
      {
        id: "p9-catalog",
        title: "Phase 1 — Product catalogue sync",
        status: "todo",
        goal: "Pull the brand's product catalogue into AutoSocials.",
        deliverables: [
          "Shopify connector + nightly product sync",
          "Manual catalogue + WooCommerce fallback",
          "Per-product creative inventory",
        ],
        exit: "Brand connects Shopify and sees their full catalogue in AutoSocials.",
      },
      {
        id: "p9-tagging",
        title: "Phase 2 — Product tagging on posts & ads",
        status: "todo",
        goal: "Tag products on organic posts and paid ads natively.",
        deliverables: [
          "IG/TikTok Shop product tag API integration",
          "Tag UI inside Publishing composer + Boost-from-organic",
          "Per-creator collab product tagging",
        ],
        exit: "User publishes a post with native product tags from inside AutoSocials.",
      },
      {
        id: "p9-bio",
        title: "Phase 3 — Link-in-bio & landing pages",
        status: "todo",
        goal: "AutoSocials-hosted link-in-bio that updates as content publishes.",
        deliverables: [
          "Link-in-bio builder (theme, links, products)",
          "Auto-link to latest post / latest collab",
          "First-party click + conversion tracking",
        ],
        exit: "Brand swaps Linktree for AutoSocials with no metric loss.",
      },
      {
        id: "p9-attribution",
        title: "Phase 4 — Conversion attribution",
        status: "todo",
        goal: "Attribute revenue back to content, creator and ad.",
        deliverables: [
          "UTM + first-party tracking + Shopify order match",
          "Per-post / per-creator / per-ad revenue report",
          "Feeds into Pillar 6 Analytics + Pillar 3 Paid",
        ],
        exit: "Brand sees \"this creator drove £X in tracked revenue\" in one screen.",
      },
    ],
  },

  // ───────────────────────── PILLAR 10 — CREATOR PERFORMANCE ─────────────────────────
  {
    id: "creator-performance",
    number: 10,
    title: "Creator Performance Tracking",
    tagline: "Track deliverables, content go-live, post performance and payout reconciliation for every collab.",
    icon: LineChart,
    status: "todo",
    why: "Sits between Outreach (#2) and Paid (#3). Turns one-off collabs into a measurable, repeatable channel.",
    competitors: "Grin, Aspire, Tagger, CreatorIQ.",
    phases: [
      {
        id: "p10-deliverables",
        title: "Phase 1 — Deliverable tracking",
        status: "todo",
        goal: "Track every promised deliverable from a collaboration.",
        deliverables: [
          "Deliverable schema attached to each collab (post type, due date, requirements)",
          "Status pipeline: agreed → submitted → approved → live",
          "Reminder workflow + escalation",
        ],
        exit: "Brand can see at any moment what each creator owes them and when.",
      },
      {
        id: "p10-detection",
        title: "Phase 2 — Auto-detect go-live",
        status: "todo",
        goal: "Detect when a creator publishes the agreed post — no manual checking.",
        deliverables: [
          "Profile polling for new posts mentioning brand handles/hashtags",
          "Match-to-collab confidence scoring",
          "Notification to brand on detected go-live",
        ],
        exit: "Brand is notified within 1 hour of a creator going live with their post.",
      },
      {
        id: "p10-perf",
        title: "Phase 3 — Post-collab performance",
        status: "todo",
        goal: "Pull views, engagement and (if Pillar 9 connected) revenue per creator post.",
        deliverables: [
          "Per-post metric ingestion (TikTok/IG)",
          "Per-creator scorecard (CPM, CPV, EMV, ROI)",
          "Compare creators in a campaign side-by-side",
        ],
        exit: "Brand can rank every creator in a campaign by ROI in one screen.",
      },
      {
        id: "p10-reconcile",
        title: "Phase 4 — Payout reconciliation",
        status: "todo",
        goal: "Tie performance to commission and creator payouts (extends Pillar 2 Phase 5).",
        deliverables: [
          "Performance-based commission rules",
          "Auto-calculated payouts ready for approval",
          "Per-creator statements with breakdown",
        ],
        exit: "Brand approves a campaign payout run with one click and creators get paid.",
      },
    ],
  },

  // ───────────────────────── PILLAR 11 — REVIEWS & REPUTATION ─────────────────────────
  {
    id: "reviews",
    number: 11,
    title: "Reviews & Reputation",
    tagline: "Google Business, Trustpilot, App Store, Meta reviews — unified reading and replying.",
    icon: Star,
    status: "todo",
    why: "Adjacent to the Inbox but a different surface — review platforms drive purchase decisions and SEO. Owning the reply loop is high-leverage.",
    competitors: "Birdeye, Podium, ReviewTrackers, Trustpilot Business.",
    phases: [
      {
        id: "p11-ingest",
        title: "Phase 1 — Review ingestion",
        status: "todo",
        goal: "Pull reviews from every connected platform into one feed.",
        deliverables: [
          "Google Business Profile API integration",
          "Trustpilot, App Store, Meta review ingestion",
          "`reviews` table + dedupe + sentiment scoring",
        ],
        exit: "New review on any connected platform appears within 30 minutes.",
      },
      {
        id: "p11-reply",
        title: "Phase 2 — Reply & escalation",
        status: "todo",
        goal: "Reply natively from AutoSocials with brand voice and approvals.",
        deliverables: [
          "Per-platform reply composer",
          "Vibe-drafted replies (extends auto-reply logic)",
          "Escalation rules: low-star → human, high-star → templated thanks",
        ],
        exit: "Brand handles 90% of reviews from inside AutoSocials.",
      },
      {
        id: "p11-insights",
        title: "Phase 3 — Reputation insights",
        status: "todo",
        goal: "Turn review streams into operational and marketing insight.",
        deliverables: [
          "Theme extraction (what people praise / complain about)",
          "Review-quote library for use in ads + content",
          "Reputation trend dashboard (extends Pillar 6)",
        ],
        exit: "Brand can answer \"what are customers actually saying about us this month?\" in one click.",
      },
    ],
  },
];

const STATUS_META: Record<PhaseStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  done: { label: "Shipped", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  in_progress: { label: "In progress", icon: Loader2, className: "text-amber-600 dark:text-amber-400" },
  todo: { label: "Planned", icon: Circle, className: "text-muted-foreground" },
};

const PILLAR_BADGE: Record<PhaseStatus, "default" | "secondary" | "outline"> = {
  done: "default",
  in_progress: "secondary",
  todo: "outline",
};

function PhaseRow({ phase }: { phase: Phase }) {
  const meta = STATUS_META[phase.status];
  const Icon = meta.icon;
  return (
    <AccordionItem value={phase.id} className="border-border/60">
      <AccordionTrigger className="hover:no-underline py-3 px-3 rounded-md hover:bg-muted/40 group">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Icon
            className={`w-4 h-4 flex-shrink-0 ${meta.className} ${
              phase.status === "in_progress" ? "animate-spin" : ""
            }`}
          />
          <span className="text-sm font-medium text-foreground truncate">{phase.title}</span>
          <span className={`ml-auto text-[11px] font-medium ${meta.className} flex-shrink-0`}>
            {meta.label}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-4 pt-1">
        <div className="pl-7 space-y-3 text-sm border-l border-border/60 ml-2">
          <div className="pl-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Goal</p>
            <p className="text-foreground">{phase.goal}</p>
          </div>
          <div className="pl-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Deliverables</p>
            <ul className="space-y-1">
              {phase.deliverables.map((d) => (
                <li key={d} className="flex gap-2 text-foreground">
                  <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pl-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Exit criteria</p>
            <p className="text-foreground">{phase.exit}</p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function PillarRow({ pillar }: { pillar: Pillar }) {
  const Icon = pillar.icon;
  const total = pillar.phases.length;
  const done = pillar.phases.filter((p) => p.status === "done").length;
  const inProgress = pillar.phases.filter((p) => p.status === "in_progress").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <AccordionItem
      value={pillar.id}
      id={pillar.id}
      className="border border-border/60 rounded-lg bg-card scroll-mt-24 data-[state=open]:shadow-xs"
    >
      <AccordionTrigger className="hover:no-underline px-4 py-4 rounded-lg hover:bg-muted/30">
        <div className="flex items-center gap-4 flex-1 min-w-0 text-left">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">
                PILLAR {pillar.number}
              </span>
              <Badge variant={PILLAR_BADGE[pillar.status]} className="text-[10px] py-0 h-4">
                {STATUS_META[pillar.status].label}
              </Badge>
            </div>
            <div className="text-base font-semibold text-foreground truncate">{pillar.title}</div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{pillar.tagline}</p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1.5 w-40 flex-shrink-0">
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{done}</span>/{total} shipped
              {inProgress > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · {inProgress} active</span>
              )}
            </div>
            <Progress value={pct} className="h-1.5 w-full" />
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">
        <div className="grid md:grid-cols-2 gap-4 text-sm py-3 border-t border-border/60">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Why this matters
            </p>
            <p className="text-foreground">{pillar.why}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Competitive landscape
            </p>
            <p className="text-foreground">{pillar.competitors}</p>
          </div>
        </div>
        <Accordion type="multiple" className="space-y-1">
          {pillar.phases.map((phase) => (
            <PhaseRow key={phase.id} phase={phase} />
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function RoadmapPage() {
  const [filter, setFilter] = useState<"all" | PhaseStatus>("all");

  const stats = useMemo(() => {
    const phases = PILLARS.flatMap((p) => p.phases);
    return {
      pillars: PILLARS.length,
      phases: phases.length,
      done: phases.filter((p) => p.status === "done").length,
      inProgress: phases.filter((p) => p.status === "in_progress").length,
      todo: phases.filter((p) => p.status === "todo").length,
    };
  }, []);

  const visiblePillars = useMemo(() => {
    if (filter === "all") return PILLARS;
    return PILLARS
      .map((p) => ({ ...p, phases: p.phases.filter((ph) => ph.status === filter) }))
      .filter((p) => p.phases.length > 0);
  }, [filter]);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          AutoSocials master roadmap
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          From creator outreach to a full agentic social OS.
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          Six core engines covering everything a modern social team does — publishing, creator partnerships, paid performance,
          community engagement, listening, and analytics. We build one engine at a time, fully shipped before moving to the next.
        </p>
      </div>

      <AgentAccessSprint />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Core pillars", value: stats.pillars },
          { label: "Total phases", value: stats.phases },
          { label: "Shipped", value: stats.done, className: "text-emerald-600 dark:text-emerald-400" },
          { label: "In progress", value: stats.inProgress, className: "text-amber-600 dark:text-amber-400" },
          { label: "Planned", value: stats.todo, className: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-4">
              <div className={`text-2xl font-semibold ${s.className ?? "text-foreground"}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All phases</TabsTrigger>
          <TabsTrigger value="done">Shipped</TabsTrigger>
          <TabsTrigger value="in_progress">In progress</TabsTrigger>
          <TabsTrigger value="todo">Planned</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-4">
          <Accordion
            type="multiple"
            defaultValue={visiblePillars
              .filter((p) => p.status === "in_progress")
              .map((p) => p.id)}
            className="space-y-2"
          >
            {visiblePillars.map((pillar) => (
              <PillarRow key={pillar.id} pillar={pillar} />
            ))}
          </Accordion>
        </TabsContent>
      </Tabs>

      {/* Footer note */}
      <Card className="border-dashed border-border/60 bg-muted/30">
        <CardContent className="p-5 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Build philosophy</p>
          <p>
            Every pillar follows the same agentic architecture: deterministic tools for actions, Vibe for reasoning,
            approval gates on anything that sends, charges, publishes or deletes. Each phase ships behind a feature flag
            and is verified end-to-end before unlocking the next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
