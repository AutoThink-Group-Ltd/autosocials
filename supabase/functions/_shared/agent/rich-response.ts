// Server-side validator for Vibe's optional `vibe-rich` envelope.
// Mirrors src/components/ai-chat/types.ts (v1). Kept in sync manually —
// this file MUST be updated whenever the client schema changes.
//
// Used by post-stream consumers (e.g. trace logging, future non-streaming
// endpoints). The streaming chat endpoint forwards the raw response body
// untouched; the client validates before rendering.

const ALLOWED_BLOCK_TYPES = new Set([
  "text",
  "heading",
  "list",
  "key_value",
  "stat",
  "chart",
  "table",
  "creator_card",
  "message_preview",
  "actions",
  "callout",
  "divider",
]);

const FENCE_RE = /```vibe-rich\s*([\s\S]*?)```/i;

export interface ExtractResult {
  /** Assistant prose with the envelope stripped. */
  prose: string;
  /** Parsed envelope object, or null if absent / invalid. */
  rich: { v: 1; summary?: string; blocks: Array<{ type: string; [k: string]: unknown }> } | null;
  /** Validation error when fence was present but invalid. */
  error?: string;
}

/**
 * Extract the optional `vibe-rich` JSON envelope from a completed assistant
 * response. Returns the prose with the fence removed plus the parsed envelope.
 * Performs a shallow structural check only — the client re-validates with Zod.
 */
export function extractRichEnvelope(text: string): ExtractResult {
  const match = text.match(FENCE_RE);
  if (!match) return { prose: text, rich: null };

  const prose = text.replace(FENCE_RE, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (e) {
    return { prose, rich: null, error: e instanceof Error ? e.message : "Invalid JSON" };
  }

  const error = validateShape(parsed);
  if (error) return { prose, rich: null, error };

  return { prose, rich: parsed as ExtractResult["rich"] };
}

function validateShape(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return "envelope must be an object";
  const obj = v as Record<string, unknown>;
  if (obj.v !== 1) return "v must be 1";
  if (!Array.isArray(obj.blocks) || obj.blocks.length === 0) return "blocks must be a non-empty array";
  if (obj.blocks.length > 40) return "blocks exceeds max length 40";
  if (obj.summary !== undefined) {
    if (typeof obj.summary !== "string") return "summary must be a string";
    if (obj.summary.length > 160) return "summary exceeds 160 chars";
  }
  for (let i = 0; i < obj.blocks.length; i++) {
    const b = obj.blocks[i];
    if (typeof b !== "object" || b === null) return `block[${i}] must be an object`;
    const t = (b as { type?: unknown }).type;
    if (typeof t !== "string" || !ALLOWED_BLOCK_TYPES.has(t)) {
      return `block[${i}] has unknown type "${String(t)}"`;
    }
  }
  return null;
}