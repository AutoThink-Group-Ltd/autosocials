import type { RichResponse } from "../types";

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  /** null = invalid-envelope demo (fallback path). */
  response: RichResponse | null;
}

const r = (blocks: RichResponse["blocks"], summary?: string): RichResponse => ({
  v: 1,
  summary,
  blocks,
});

export const demoScenarios: DemoScenario[] = [
  {
    id: "answer_evidence",
    title: "Answer + evidence",
    description: "Recommendation with reasoning, evidence, sources and confidence.",
    response: r([
      {
        type: "answer_evidence",
        answer: "Partner with mid-tier fitness creators on TikTok first.",
        reasoning: "Higher engagement and lower CPM than Instagram for this niche.",
        evidence: [
          "Average ER 6.2% on TikTok vs 2.1% on Instagram for fitness <500k.",
          "3 of 5 recent SaaS launches we tracked started on TikTok.",
        ],
        sources: [{ label: "Discovery DB" }, { label: "Insights · last 30d" }],
        confidence: "high",
        suggestedNextAction: {
          label: "Run discovery",
          action: "demo.run",
          variant: "primary",
          requiresConfirmation: false,
        },
      },
    ]),
  },
  {
    id: "kpi_cards",
    title: "KPI cards",
    description: "3–6 metrics with status colour coding.",
    response: r([
      {
        type: "kpi_cards",
        cards: [
          { label: "Replies", value: "42", delta: "+12%", trend: "up", status: "positive" },
          { label: "Open rate", value: "61%", delta: "-3%", trend: "down", status: "warning" },
          { label: "Bounces", value: "1", delta: "0", trend: "flat", status: "neutral" },
        ],
      },
    ]),
  },
  {
    id: "smart_table",
    title: "Smart table",
    description: "Compact table with multiple rows.",
    response: r([
      {
        type: "table",
        title: "Top creators this week",
        columns: [
          { key: "h", label: "Handle" },
          { key: "f", label: "Followers" },
          { key: "er", label: "ER" },
        ],
        rows: [
          { h: "@fitwithjess", f: "84k", er: "5.4%" },
          { h: "@gymrat.dan", f: "162k", er: "3.1%" },
          { h: "@mealpreplab", f: "47k", er: "7.0%" },
        ],
      },
    ]),
  },
  {
    id: "creator_card",
    title: "Creator card",
    description: "Single creator preview.",
    response: r([
      {
        type: "creator_card",
        creator: {
          handle: "@fitwithjess",
          platform: "tiktok",
          displayName: "Jess M.",
          followers: 84000,
          engagementRate: 5.4,
          bio: "Calisthenics coach. New routine every Monday.",
        },
      },
    ]),
  },
  {
    id: "email_preview",
    title: "Email preview",
    description: "Outreach draft with inline send/edit actions.",
    response: r([
      {
        type: "email_preview",
        to: "jess@example.com",
        from: "you@brand.com",
        subject: "Quick collab idea — your Monday routine",
        body: "Hey Jess,\n\nLove the consistency of your Monday drops. We'd love to send you our new resistance band kit and see if it fits your style.\n\n— The Team",
        actions: [
          {
            label: "Send",
            action: "demo.send",
            variant: "primary",
            requiresConfirmation: true,
            riskLevel: "high",
            confirmationMessage: "This will send the email to Jess immediately.",
          },
        ],
      },
    ]),
  },
  {
    id: "approval_card",
    title: "Approval card",
    description: "Destructive action — auto-routed to approval queue.",
    response: r([
      {
        type: "approval_card",
        title: "Delete list 'Q3 Beauty Picks'",
        summary: "29 creators · 4 active conversations will be archived.",
        riskLevel: "destructive",
        approve: {
          label: "Delete list",
          action: "demo.delete",
          variant: "destructive",
          requiresConfirmation: true,
          riskLevel: "destructive",
        },
      },
    ]),
  },
  {
    id: "form",
    title: "Form request",
    description: "Asks only for the missing fields.",
    response: r([
      {
        type: "form",
        title: "Tell me more",
        description: "What's your monthly outreach budget?",
        submitLabel: "Continue",
        submitAction: "demo.run",
        fields: [
          { kind: "select", name: "tier", label: "Tier", options: [
            { label: "Starter", value: "starter" },
            { label: "Growth", value: "growth" },
            { label: "Scale", value: "scale" },
          ]},
          { kind: "number", name: "budget", label: "USD / month" },
          { kind: "toggle", name: "ugc", label: "Include UGC creators" },
        ],
      },
    ]),
  },
  {
    id: "next_best_action",
    title: "Next best action",
    description: "Single recommended next step.",
    response: r([
      {
        type: "next_best_action",
        title: "Add 12 new creators to your shortlist",
        rationale: "We found 12 new TikTok creators matching your filters since yesterday.",
        action: { label: "Open shortlist", action: "demo.run", variant: "primary", requiresConfirmation: false },
      },
    ]),
  },
  {
    id: "timeline",
    title: "Timeline snapshot",
    description: "Recent events in order.",
    response: r([
      {
        type: "timeline_snapshot",
        title: "Last 24h",
        events: [
          { timestamp: "10:02", actor: "Vibe", eventType: "discovery_run", description: "Found 18 new creators" },
          { timestamp: "11:14", actor: "You", eventType: "outreach_sent", description: "Sent 4 DMs" },
          { timestamp: "16:30", actor: "@fitwithjess", eventType: "reply_received", description: "Interested!" },
        ],
      },
    ]),
  },
  {
    id: "multi_source",
    title: "Multi-source view",
    description: "Partial answer with sources used / unavailable.",
    response: r([
      {
        type: "multi_source_view",
        sourcesUsed: [{ label: "TikTok", freshness: "2h ago" }, { label: "Discovery DB" }],
        sourcesUnavailable: ["Instagram (rate limited)"],
        lastUpdated: "Just now",
        completeness: 0.66,
        isPartial: true,
      },
    ]),
  },
  {
    id: "data_quality",
    title: "Data quality panel",
    description: "Highlights gaps and suggested fixes.",
    response: r([
      {
        type: "data_quality_panel",
        completeness: 0.4,
        freshness: "12 days",
        gaps: ["Missing emails for 14 creators", "Engagement rate stale for 6"],
        suggestedFixes: ["Run enrichment", "Refresh top 25 profiles"],
      },
    ]),
  },
  {
    id: "callouts",
    title: "Callouts (intents)",
    description: "Info / success / warning / danger.",
    response: r([
      { type: "callout", intent: "info", title: "Heads-up", body: "TikTok scanning is currently slower than usual." },
      { type: "callout", intent: "success", title: "Done", body: "Sent 12 DMs." },
      { type: "callout", intent: "warning", title: "Quota", body: "You're at 80% of your monthly send cap." },
      { type: "callout", intent: "danger", title: "Failed", body: "3 messages bounced." },
    ]),
  },
  {
    id: "states",
    title: "Empty / Error / Loading",
    description: "Universal state blocks.",
    response: r([
      {
        type: "empty_state",
        title: "No creators match",
        body: "Try widening your filters or scanning a different niche.",
        action: { label: "Open discovery", action: "demo.run", variant: "primary", requiresConfirmation: false },
      },
      {
        type: "error_state",
        title: "Couldn't reach TikTok",
        body: "Rate limit hit. Retrying in 60s.",
        retryAction: { label: "Retry now", action: "demo.run", variant: "secondary", requiresConfirmation: false },
      },
      { type: "loading_state", label: "Scanning Instagram…" },
    ]),
  },
  {
    id: "mixed",
    title: "Mixed response",
    description: "Realistic full-stack chat answer.",
    response: r(
      [
        { type: "text", body: "Here are the top 3 creators that match your brief." },
        {
          type: "kpi_cards",
          cards: [
            { label: "Matches", value: "12", status: "positive" },
            { label: "Avg ER", value: "4.8%", status: "positive" },
            { label: "Avg followers", value: "94k", status: "neutral" },
          ],
        },
        {
          type: "table",
          columns: [
            { key: "h", label: "Handle" },
            { key: "f", label: "Followers" },
            { key: "er", label: "ER" },
          ],
          rows: [
            { h: "@fitwithjess", f: "84k", er: "5.4%" },
            { h: "@gymrat.dan", f: "162k", er: "3.1%" },
            { h: "@mealpreplab", f: "47k", er: "7.0%" },
          ],
        },
        {
          type: "next_best_action",
          title: "Save these 3 to a list",
          action: { label: "Save shortlist", action: "demo.save", variant: "primary", requiresConfirmation: false },
        },
      ],
      "3 strong matches with a clear ER lead.",
    ),
  },
  {
    id: "invalid",
    title: "Invalid envelope",
    description: "Demonstrates client-side fallback when validation fails.",
    response: null,
  },
  // ── Phase 8 (G7): coverage for portability blocks + every state ──
  {
    id: "comparison_strip",
    title: "Compare creators",
    description: "Side-by-side comparison with strengths/weaknesses + recommended.",
    response: r(
      [
        { type: "text", body: "Three fitness creators side by side." },
        {
          type: "comparison_strip",
          title: "Top 3 candidates",
          entities: [
            { name: "@fitwithjess", keyMetric: "ER 5.4%", trend: "up", strengths: ["Strong UGC", "Replies fast"], weaknesses: ["Smaller reach"], recommended: true },
            { name: "@gymrat.dan", keyMetric: "ER 3.1%", trend: "flat", strengths: ["Largest reach"], weaknesses: ["Lower ER"] },
            { name: "@mealpreplab", keyMetric: "ER 7.0%", trend: "up", strengths: ["Niche fit"], weaknesses: ["Tiny audience"] },
          ],
        },
      ],
      "Recommend @fitwithjess based on ER and responsiveness.",
    ),
  },
  {
    id: "drill_down",
    title: "Progressive disclosure",
    description: "Summary → Detail → Source layers.",
    response: r([
      {
        type: "drill_down",
        title: "Why this creator?",
        layers: [
          { label: "summary", body: "Strong audience-brand fit and high reply rate." },
          { label: "detail", body: "78% audience overlap with target demo. Average reply time 2h." },
          { label: "source", body: "TikTok Commercial API + last 30d outreach traces." },
        ],
      },
    ]),
  },
  {
    id: "document_preview",
    title: "Document preview",
    description: "Markdown-style document body with download action.",
    response: r([
      {
        type: "document_preview",
        title: "Brand brief — Spring drop",
        subtitle: "v3 · last edited yesterday",
        body: "# Spring Drop\n\nHero creators receive product 4 weeks ahead. Key talking points:\n- Sustainable fabric\n- New colourway\n- Limited 200 units",
        actions: [
          { label: "Download PDF", action: "demo.download", variant: "secondary", requiresConfirmation: false },
          { label: "Edit", action: "demo.edit", variant: "ghost", requiresConfirmation: false },
        ],
      },
    ]),
  },
  {
    id: "file_preview",
    title: "File attachment",
    description: "Compact file row with size + actions.",
    response: r([
      {
        type: "file_preview",
        filename: "creator_shortlist_2026.csv",
        mimeType: "text/csv",
        sizeBytes: 18400,
        url: "https://example.com/file.csv",
        caption: "12 creators exported from your latest discovery run.",
      },
    ]),
  },
  {
    id: "report_preview",
    title: "Weekly report",
    description: "Headline metrics + highlights + next-step actions.",
    response: r([
      {
        type: "report_preview",
        title: "Outreach weekly recap",
        period: "Mar 3 – Mar 9, 2026",
        metrics: [
          { label: "Sent", value: "142" },
          { label: "Replied", value: "38" },
          { label: "Reply rate", value: "26.8%" },
          { label: "Booked", value: "9" },
        ],
        highlights: [
          "Reply rate up 4.2pp week-over-week.",
          "Top-performing template: 'Spring drop intro v2'.",
          "3 stalled threads need a nudge.",
        ],
        actions: [{ label: "Open full report", action: "demo.report.open", variant: "primary", requiresConfirmation: false }],
      },
    ]),
  },
  {
    id: "checklist",
    title: "Onboarding checklist",
    description: "Mix of done/pending items with hints.",
    response: r([
      {
        type: "checklist",
        title: "Before your first send",
        items: [
          { label: "Verify sender domain", done: true, hint: "DKIM + SPF passed" },
          { label: "Connect TikTok account", done: true },
          { label: "Write your first template", done: false, hint: "We can draft one for you." },
          { label: "Pick a creator list", done: false },
        ],
      },
    ]),
  },
  {
    id: "status_panel",
    title: "Workspace health",
    description: "Status badge, summary line, and signal grid.",
    response: r([
      {
        type: "status_panel",
        title: "Outreach pipeline",
        status: "warning",
        summary: "3 threads stalled and 1 sender domain near its daily cap.",
        signals: [
          { label: "Active campaigns", value: "4" },
          { label: "Stalled threads", value: "3" },
          { label: "Domain cap", value: "92%" },
          { label: "Bounce rate", value: "0.8%" },
        ],
      },
    ]),
  },
  {
    id: "workflow_steps",
    title: "Multi-step workflow",
    description: "Steps with todo/active/done/blocked states.",
    response: r([
      {
        type: "workflow_steps",
        title: "New campaign rollout",
        steps: [
          { label: "Pick creators", status: "done" },
          { label: "Draft messages", status: "done" },
          { label: "Schedule sends", status: "active" },
          { label: "Track replies", status: "todo" },
          { label: "Close out", status: "blocked", hint: "Awaiting brand approval" },
        ],
      },
    ]),
  },
  {
    id: "loading_state",
    title: "Loading state",
    description: "Working indicator block.",
    response: r([{ type: "loading_state", label: "Scanning TikTok for fresh matches…" }]),
  },
  {
    id: "error_state",
    title: "Error state with retry",
    description: "Soft failure with retry action.",
    response: r([
      {
        type: "error_state",
        title: "Couldn't reach Instagram graph",
        body: "We'll keep your saved results and try again automatically.",
        retryAction: { label: "Retry now", action: "demo.retry", variant: "secondary", requiresConfirmation: false },
      },
    ]),
  },
];