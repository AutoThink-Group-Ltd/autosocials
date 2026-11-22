import type { Block, RichResponse } from "../types";

/**
 * Client-side guardrails that strip blocks the planner shouldn't have emitted.
 * Defensive only — the renderer always falls back gracefully if applied late.
 */
export interface GuardrailResult {
  response: RichResponse;
  warnings: string[];
}

export function applyCompositionGuardrails(input: RichResponse): GuardrailResult {
  const warnings: string[] = [];
  const blocks: Block[] = [];
  for (const b of input.blocks) {
    // kpi_cards with no cards → drop.
    if (b.type === "kpi_cards" && b.cards.length === 0) {
      warnings.push("Dropped empty kpi_cards block");
      continue;
    }
    // table with <2 rows → degrade to a simple list of values would require
    // schema knowledge; we just drop it and warn.
    if (b.type === "table" && b.rows.length < 2) {
      warnings.push("Dropped table block with <2 rows");
      continue;
    }
    // chart with single point → drop.
    if (b.type === "chart" && b.data.length < 2) {
      warnings.push("Dropped chart block with <2 data points");
      continue;
    }
    // approval_card without an approve action handler is still legal — the
    // dispatcher surfaces "Unknown action" if the host hasn't registered one.
    blocks.push(b);
  }
  if (blocks.length === 0) {
    // Never return an empty response — fall back to a textual summary.
    blocks.push({
      type: "text",
      body: input.summary || input.metadata?.fallbackText || "No content.",
    });
    warnings.push("All blocks were dropped; fell back to text");
  }
  return {
    response: { ...input, blocks: blocks as RichResponse["blocks"] },
    warnings,
  };
}