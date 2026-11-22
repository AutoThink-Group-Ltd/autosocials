// Phase 6 — tolerant partial parser for streamed `vibe-rich` envelopes.
// During streaming the JSON tail is incomplete; we attempt to balance the
// outstanding braces/brackets and validate any blocks already complete.
// Invalid / in-progress trailing blocks are dropped — the renderer shows a
// skeleton in their place.

import { BlockSchema, RichResponseSchema, type Block, type RichResponse } from "./types";

export interface PartialParseResult {
  /** Fenced envelope detected (open or closed). */
  detected: boolean;
  /** True if the closing ``` fence has been received. */
  complete: boolean;
  /** Best-effort response with only blocks that validated. */
  response: RichResponse | null;
  /** Number of trailing blocks dropped because they were partial/invalid. */
  dropped: number;
}

const FENCE_OPEN = /```vibe-rich\s*/i;

/** Extract the inside of a `vibe-rich` fence, even if not yet closed. */
function extractFenceBody(text: string): { body: string; complete: boolean } | null {
  const open = text.match(FENCE_OPEN);
  if (!open || open.index === undefined) return null;
  const after = text.slice(open.index + open[0].length);
  const closeIdx = after.indexOf("```");
  if (closeIdx === -1) return { body: after, complete: false };
  return { body: after.slice(0, closeIdx), complete: true };
}

/**
 * Try to make a partial JSON string parseable by closing any outstanding
 * structural tokens. Strings, escapes and depth are tracked so we don't
 * accidentally close inside a literal. Returns null if unrecoverable.
 */
function balanceJson(src: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  let lastNonWs = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (!/\s/.test(c)) lastNonWs = i;
    if (inStr) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      if (stack.pop() !== c) return null;
    }
  }
  let trimmed = src.slice(0, lastNonWs + 1);
  if (inStr) trimmed += '"';
  // Drop trailing comma / colon / partial token before closing.
  trimmed = trimmed.replace(/[,:]\s*$/, "");
  // If the dangling token is a property key without a value, strip it.
  trimmed = trimmed.replace(/,\s*"[^"]*"\s*$/, "");
  while (stack.length) trimmed += stack.pop();
  return trimmed;
}

/** Parse a streamed assistant message and return the best partial render. */
export function parsePartialRich(text: string): PartialParseResult {
  const fence = extractFenceBody(text);
  if (!fence) return { detected: false, complete: false, response: null, dropped: 0 };

  // Fast path — closed fence, parse strictly.
  if (fence.complete) {
    try {
      const parsed = JSON.parse(fence.body.trim());
      const result = RichResponseSchema.safeParse(parsed);
      if (result.success) {
        return { detected: true, complete: true, response: result.data, dropped: 0 };
      }
      // Fall through to lenient block-by-block recovery.
      return lenient(fence.body, true);
    } catch {
      return lenient(fence.body, true);
    }
  }

  return lenient(fence.body, false);
}

function lenient(body: string, complete: boolean): PartialParseResult {
  const balanced = balanceJson(body);
  if (!balanced) return { detected: true, complete, response: null, dropped: 0 };
  let parsed: any;
  try {
    parsed = JSON.parse(balanced);
  } catch {
    return { detected: true, complete, response: null, dropped: 0 };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.blocks)) {
    return { detected: true, complete, response: null, dropped: 0 };
  }
  const validBlocks: Block[] = [];
  let dropped = 0;
  for (const raw of parsed.blocks) {
    const r = BlockSchema.safeParse(raw);
    if (r.success) validBlocks.push(r.data);
    else dropped++;
  }
  if (validBlocks.length === 0) {
    return { detected: true, complete, response: null, dropped };
  }
  const response: RichResponse = {
    v: 1,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 160) : undefined,
    blocks: validBlocks as RichResponse["blocks"],
  };
  return { detected: true, complete, response, dropped };
}