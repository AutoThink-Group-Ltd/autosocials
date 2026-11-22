// Pure rules for Sam's custom HyperFrames designs. Shared by the server and tests.
import { isBuiltinPath } from "./autotoast-builtins";

/** Keywords that mark a brand doc as part of its motion / design kit. Earlier = higher priority. */
export const KIT_KEYWORDS = ["design-system", "design system", "approved", "copy", "component", "motion", "easing", "storyboard", "inventory", "handoff", "gsap", "brand guide", "guideline", "ui-kit", "ui kit", "readme", "website", "about", "positioning", "messaging"];

export function kitPriority(name: string, label?: string | null): number {
  const s = `${name} ${label ?? ""}`.toLowerCase();
  const i = KIT_KEYWORDS.findIndex((k) => s.includes(k));
  return i;
}

/** Pick kit docs (highest priority first) and pack their text under a char budget. */
export function packKit(docs: { name: string; label?: string | null; text: string | null }[], budget = 16000) {
  const picked = docs
    .map((d) => ({ ...d, p: kitPriority(d.name, d.label) }))
    .filter((d) => d.p >= 0 && d.text?.trim())
    .sort((a, b) => a.p - b.p || a.name.localeCompare(b.name));
  let out = ""; const used: string[] = [];
  for (const d of picked) {
    const chunk = `\n\n=== ${d.name} ===\n${d.text!.trim()}`;
    if (out.length + chunk.length > budget) continue;
    out += chunk; used.push(d.name);
  }
  return { text: out.trim(), used };
}

/** Evenly-paced caption timings from the script and the voice length (weighted by word length). */
export function captionTimings(script: string, audioSeconds: number) {
  const words = script.split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.length + 2);
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let t = 0.2;
  const span = Math.max(1, audioSeconds - 0.3);
  return words.map((w, i) => { const s = t; t += (weight[i]! / total) * span; return { word: w, start: +s.toFixed(2), end: +t.toFixed(2) }; });
}

/** Seconds of audio from a WAV header, or an estimate for 128 kbps MP3. */
export function audioSeconds(buf: ArrayBuffer, mime: string): number {
  if (mime.includes("wav") && buf.byteLength > 44) {
    const v = new DataView(buf);
    const byteRate = v.getUint32(28, true);
    if (byteRate > 0) return (buf.byteLength - 44) / byteRate;
  }
  return (buf.byteLength * 8) / 128000;
}

export type CheckInput = { html: string; duration: number; files: string[] };

/** Returns a list of problems; empty means the design can go to the render server. */
export function validateComposition({ html, duration, files }: CheckInput): string[] {
  const p: string[] = [];
  if (!/^\s*<!doctype html>/i.test(html)) p.push("Must start with <!doctype html>.");
  if (!/data-composition-id="main"/.test(html)) p.push('Root needs data-composition-id="main".');
  const d = html.match(/data-composition-id="main"[^>]*data-duration="([\d.]+)"|data-duration="([\d.]+)"[^>]*data-composition-id="main"/);
  const dur = d ? Number(d[1] ?? d[2]) : NaN;
  // Exact length: 30s = 900 frames at 30fps, so the root must match to the frame.
  if (!(Math.abs(dur - duration) < 1 / 60)) p.push(`Root data-duration must be ${duration}.`);
  if (!/window\.__timelines\s*\[\s*["']main["']\s*\]\s*=/.test(html)) p.push('Register the timeline as window.__timelines["main"].');
  if (!/gsap\.timeline\(\s*\{[^}]*paused\s*:\s*true/.test(html)) p.push("Use one gsap.timeline({paused:true}).");
  if (/\.play\(\)/.test(html)) p.push("Never call play().");
  if (/setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(html)) p.push("No timers, rAF loops or randomness.");
  if (/@keyframes|animation\s*:/.test(html)) p.push("No CSS animations; animate only through the timeline.");
  if (/https?:\/\//i.test(html.replace(/http:\/\/www\.w3\.org\/[^"']*/g, ""))) p.push("No external URLs; use only supplied files.");
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
  if (!scripts.some((s) => s === "gsap.min.js" || s === "_lib/gsap/gsap.min.js")) p.push('Load GSAP with <script src="_lib/gsap/gsap.min.js"></script>.');
  if (scripts.some((s) => !isBuiltinPath(s))) p.push("Only the built-in _lib/ scripts are allowed.");
  const allowed = new Set(files);
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"|url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1] ?? m[2]!).filter((r) => !r.startsWith("data:"));
  const bad = [...new Set(refs.filter((r) => !allowed.has(r) && !isBuiltinPath(r)))];
  if (bad.length) p.push(`Unknown files referenced: ${bad.slice(0, 5).join(", ")}.`);
  if (/—|&mdash;|&#8212;/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) p.push("No em dashes in on-screen copy.");
  if (/\.split\(\s*(["'`])\1\s*\)|Array\.from\(\s*[\w.]+\.textContent\s*\)/.test(html)) p.push("Animate whole words; never split text into characters.");
  if (/<img[^>]*(?:logo|icon)[^>]*style="[^"]*(?:border|outline)\s*:/i.test(html)) p.push("No borders or outlines around logo images.");
  if (!/clip/.test(html) || !/data-track-index=/.test(html)) p.push("Timed elements need class=\"clip\", data-start, data-duration and data-track-index.");
  return p;
}
