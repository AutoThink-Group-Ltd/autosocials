import type { PresentationType, Block } from "../types";

/**
 * Deterministic presentation planner — the chat-layer counterpart to the
 * model-side planning rules baked into Vibe's system prompt.
 *
 * The model is the primary planner; it picks blocks based on the few-shot
 * examples in `prompts/vibe-chat.ts`. This module exists so:
 *   1. Other AutoThink apps reusing this folder can classify intent
 *      without depending on a specific LLM prompt.
 *   2. We can run server-side validation that the model's chosen
 *      `presentation_type` is consistent with the user's intent.
 *   3. Tests can exercise the rules table without invoking an LLM.
 */

export interface PlannerInput {
  /** Raw user message, lowercased internally. */
  message: string;
  /** Optional hints from upstream skills (entity counts, missing fields). */
  hints?: {
    rowCount?: number;
    metricCount?: number;
    sourceCount?: number;
    missingFields?: string[];
    requiresApproval?: boolean;
    isComparison?: boolean;
    hasTimeline?: boolean;
    isDraft?: boolean;
    isReport?: boolean;
  };
}

export interface PlannerOutput {
  presentationType: PresentationType;
  /** Suggested block types in render order. Hosts may ignore. */
  selectedBlocks: Block["type"][];
  reason: string;
}

const PATTERNS: Array<{
  test: (msg: string, hints: PlannerInput["hints"]) => boolean;
  out: Omit<PlannerOutput, "reason"> & { reason: string };
}> = [
  // Form requests
  {
    test: (_, h) => Boolean(h?.missingFields && h.missingFields.length > 0),
    out: {
      presentationType: "form_request",
      selectedBlocks: ["text", "form"],
      reason: "Missing required inputs — ask the user via a form.",
    },
  },
  // Approval-required mutations
  {
    test: (_, h) => Boolean(h?.requiresApproval),
    out: {
      presentationType: "action_panel",
      selectedBlocks: ["text", "approval_card"],
      reason: "Mutation needs explicit approval before execution.",
    },
  },
  // Comparisons
  {
    test: (m, h) =>
      Boolean(h?.isComparison) || /\b(compare|vs\.?|versus|difference between)\b/.test(m),
    out: {
      presentationType: "comparison",
      selectedBlocks: ["text", "comparison_strip", "next_best_action"],
      reason: "User asked to compare entities.",
    },
  },
  // Timelines / history
  {
    test: (m, h) =>
      Boolean(h?.hasTimeline) || /\b(history|timeline|over time|recently|past \d)/.test(m),
    out: {
      presentationType: "timeline",
      selectedBlocks: ["text", "timeline_snapshot"],
      reason: "User asked about history or sequence of events.",
    },
  },
  // Drafts / messaging
  {
    test: (m, h) =>
      Boolean(h?.isDraft) ||
      /\b(draft|write|compose|reply to|email|message|dm)\b/.test(m),
    out: {
      presentationType: "preview",
      selectedBlocks: ["text", "email_preview", "action_row"],
      reason: "User asked for a draft — render preview with edit/send actions.",
    },
  },
  // Reports
  {
    test: (m, h) => Boolean(h?.isReport) || /\b(report|summary of|recap|wrap[- ]up)\b/.test(m),
    out: {
      presentationType: "mixed_response",
      selectedBlocks: ["report_preview", "next_best_action"],
      reason: "User wants a digest — render report preview.",
    },
  },
  // KPI / metrics
  {
    test: (m, h) =>
      (h?.metricCount ?? 0) >= 2 ||
      /\b(kpi|metric|stats|performance|engagement|reply rate|conversion)\b/.test(m),
    out: {
      presentationType: "kpi_summary",
      selectedBlocks: ["text", "kpi_cards"],
      reason: "Metric-heavy answer — show KPI cards.",
    },
  },
  // Tabular records
  {
    test: (m, h) =>
      (h?.rowCount ?? 0) >= 2 ||
      /\b(list|show me|find|top \d|priority|creators|leads|accounts)\b/.test(m),
    out: {
      presentationType: "smart_table",
      selectedBlocks: ["text", "table", "action_row"],
      reason: "Multi-row records — render a smart table.",
    },
  },
  // Charts
  {
    test: (m) => /\b(trend|growth|chart|graph|over the last|by week|by month)\b/.test(m),
    out: {
      presentationType: "chart_summary",
      selectedBlocks: ["text", "chart"],
      reason: "Trend question — render a chart.",
    },
  },
  // Multi-source attribution
  {
    test: (_, h) => (h?.sourceCount ?? 0) >= 2,
    out: {
      presentationType: "source_breakdown",
      selectedBlocks: ["answer_evidence", "multi_source_view"],
      reason: "Answer assembled from multiple sources — show provenance.",
    },
  },
  // Why / explain
  {
    test: (m) => /\b(why|how come|reason|explain|because)\b/.test(m),
    out: {
      presentationType: "answer_with_evidence",
      selectedBlocks: ["answer_evidence"],
      reason: "User asked for reasoning — show evidence.",
    },
  },
];

export function planPresentation(input: PlannerInput): PlannerOutput {
  const msg = input.message.toLowerCase();
  for (const p of PATTERNS) {
    if (p.test(msg, input.hints)) return p.out;
  }
  return {
    presentationType: "plain_text",
    selectedBlocks: ["text"],
    reason: "Simple conversational answer — plain text is sufficient.",
  };
}