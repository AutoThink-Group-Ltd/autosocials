import { useCallback, useEffect, useRef, useState } from "react";
import { TOKEN_REGISTRY, type TokenSpec } from "@/brand/baseline";
import { colorsMatch, parseColor, toColorExpression, toHex, toHslString, type Rgba } from "@/brand/color";

export type TokenStatus = "Matches" | "Mismatch" | "Missing" | "Unresolved";

export interface LiveToken extends TokenSpec {
  raw: string;
  expression: string | null;
  rgba: Rgba | null;
  hex: string | null;
  hsl: string | null;
  status: TokenStatus;
  reason?: string;
}

/** Resolve any CSS colour via a 1×1 canvas so OKLCH/named colours work too. */
function resolveInBrowser(expr: string): Rgba | null {
  const direct = parseColor(expr);
  if (direct) return direct;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = expr;
  if (ctx.fillStyle === "#010203" && expr.toLowerCase() !== "#010203") return null;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return { r: d[0]!, g: d[1]!, b: d[2]!, a: +(d[3]! / 255).toFixed(3) };
}

export function readToken(el: Element, spec: TokenSpec): LiveToken {
  const raw = getComputedStyle(el).getPropertyValue(spec.cssVar).trim();
  if (!raw) return { ...spec, raw, expression: null, rgba: null, hex: null, hsl: null, status: "Missing", reason: "Variable is not defined in this scope." };
  const expression = toColorExpression(raw);
  const rgba = expression ? resolveInBrowser(expression) : null;
  if (!rgba) return { ...spec, raw, expression, rgba: null, hex: null, hsl: null, status: "Unresolved", reason: "Value is not a valid colour." };
  let status: TokenStatus = "Matches";
  let reason: string | undefined;
  if (spec.approved) {
    const ref = parseColor(spec.approved);
    if (ref && !colorsMatch(rgba, ref)) { status = "Mismatch"; reason = `Expected ${spec.approved}, observed ${toHex(rgba)}.`; }
  }
  return { ...spec, raw, expression, rgba, hex: toHex(rgba), hsl: toHslString(rgba), status, ...(reason ? { reason } : {}) };
}

/** Reads the token registry from a scoped element; re-reads on Refresh, root class/style changes and font load. */
export function useLiveTokens() {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const [tokens, setTokens] = useState<LiveToken[]>([]);
  const [inspectedAt, setInspectedAt] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    const el = scopeRef.current;
    if (!el) return;
    setTokens(TOKEN_REGISTRY.map((s) => readToken(el, s)));
    setInspectedAt(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const obs = new MutationObserver(() => refresh());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { obs.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  return { scopeRef, tokens, inspectedAt, refresh };
}
