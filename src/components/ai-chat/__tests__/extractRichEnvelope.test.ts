// Mirror of supabase/functions/_shared/agent/rich-response.ts behaviour.
// We re-implement in TS so the same contract is exercised under vitest
// (Deno tests aren't part of the harness).
import { describe, it, expect } from "vitest";
import { parseRichResponse } from "../types";

const FENCE_RE = /```vibe-rich\s*([\s\S]*?)```/i;

function extract(text: string) {
  const m = text.match(FENCE_RE);
  if (!m) return { prose: text, rich: null as unknown };
  const prose = text.replace(FENCE_RE, "").trim();
  try {
    return { prose, rich: JSON.parse((m[1] ?? "").trim()) };
  } catch {
    return { prose, rich: null };
  }
}

describe("vibe-rich fence extraction", () => {
  it("returns null rich when no fence", () => {
    expect(extract("hello").rich).toBeNull();
  });

  it("extracts and validates a fenced envelope", () => {
    const text = 'Sure!\n```vibe-rich\n{"v":1,"blocks":[{"type":"text","body":"hi"}]}\n```';
    const { prose, rich } = extract(text);
    expect(prose).toBe("Sure!");
    const r = parseRichResponse(rich);
    expect(r.ok).toBe(true);
  });

  it("client validator rejects malformed envelope from fence", () => {
    const text = '```vibe-rich\n{"v":2,"blocks":[]}\n```';
    const { rich } = extract(text);
    expect(parseRichResponse(rich).ok).toBe(false);
  });
});