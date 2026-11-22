import { parse, type DefaultTreeAdapterMap } from "parse5";
import { readStoryboardSections } from "./build-prompt";
// Server-only: Sam designs a bespoke HyperFrames composition per asset from the brand's motion kit.
import { packKit, validateComposition } from "./composition-rules";
import { zonesFor, zonesBrief, zoneProblems } from "./safe-zones";
import officialNotes from "../../prompts/hyperframes/official-notes.md?raw";
import { mediaTreatmentProblems, coverageGaps, type WordTime } from "./film-qa";
import type { getAdminClient } from "./supabase-admin.server";
import { BUILTINS_BRIEF, builtinFontSlug } from "./autotoast-builtins";
import { fetchOpenAI } from "./openai-quota.server";
import { CREATIVE_PLAYBOOK } from "./playbook.server";

type Admin = ReturnType<typeof getAdminClient>;
const MODEL = "gpt-5.4";

/** The brand's motion / design kit text (design system, components, copy, storyboard, handoff...). */
export async function loadMotionKit(admin: Admin, workspaceId: string) {
  const { data } = await admin.from("brand_files").select("name,ai_label,extracted_text")
    .eq("workspace_id", workspaceId).eq("kind", "doc").not("extracted_text", "is", null).limit(200);
  return packKit((data ?? []).map((d) => ({ name: d.name, label: d.ai_label, text: d.extracted_text })));
}

/** First font the kit or profile names, e.g. "Use DM Sans throughout". */
export function kitFont(kit: string, profileFonts?: unknown): string | null {
  const m = kit.match(/\b[Uu]se ([A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+){0,2}) (?:throughout|at every size|for all)/);
  if (m) return m[1]!;
  const f = Array.isArray(profileFonts) ? profileFonts.map(String)[0] : null;
  return f?.replace(/[^A-Za-z0-9 ].*$/, "").trim() || null;
}

const fontCache = new Map<string, { files: Record<string, { base64: string }>; css: string } | null>();

/** Downloads a Google font (latin, 400/500/700) as project files, because renders run offline. */
export async function loadBrandFont(family: string | null) {
  if (!family) return null;
  if (fontCache.has(family)) return fontCache.get(family)!;
  try {
    const base = "https://fonts.googleapis.com/css2?family="+encodeURIComponent(family.replace(/\s+Variable$/i,"")).replace(/%20/g, "+");
    const options = {headers: {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"},signal:AbortSignal.timeout(10000)};
    let response=await fetch(base+":wght@400;500;700&display=block",options);
    if(response.status===400)response=await fetch(base+"&display=block",options);
    if(!response.ok)return null;
    const css=await response.text();
    const blocks = [...css.matchAll(/\/\* latin \*\/\s*@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]!);
    const files: Record<string, { base64: string }> = {}; let face = "";
    for (const b of blocks) {
      const w = b.match(/font-weight:\s*(\d+)/)?.[1]; const url = b.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      if (!w || !url || files[`fonts/brand-${w}.woff2`]) continue;
      if(new URL(url).hostname!=="fonts.gstatic.com")continue;
      const fontResponse=await fetch(url,{signal:AbortSignal.timeout(10000)});
      if(!fontResponse.ok)continue;
      const buf = new Uint8Array(await fontResponse.arrayBuffer());
      let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      files[`fonts/brand-${w}.woff2`] = { base64: btoa(s) };
      face += `@font-face{font-family:"Brand";font-weight:${w};src:url("fonts/brand-${w}.woff2") format("woff2");font-display:block}`;
    }
    const out = face ? { files, css: face } : null;
    if(out)fontCache.set(family, out);
    return out;
  } catch { return null; }
}

export type DesignInput = {
  kit: string; size: string; duration: number; brand: string;
  brief: { narrative: string; hook: string; beats: string[]; voiceover: string; cta: string; script: string; caption: string; argument?: string };
  audioSeconds: number; words: WordTime[]; files: { path: string; name: string; kind: string; summary: string }[];
  images?: { path: string; dataUrl: string }[];
  fontCss: string | null; fontFamily: string | null; palette: { bg: string; fg: string; accent: string; primary?: string };
  previousHtml?: string | null; revisionNote?: string | null;
  /** Hamza-style playbook prompt, house rules and the brand's approved films (style set). */
  buildPrompt?: string | null; houseRules?: string; references?: string[];
};

export type BuildReport = { scene_plan: string[]; reused_components: string[]; clashes: string[]; vo_fit: string; approved_plan: string[]; review_notes: string[]; review_status?: "reviewed" | "failed" };
const REPORT_SCHEMA = { type: "object", additionalProperties: false, required: ["scene_plan", "reused_components", "clashes", "vo_fit"], properties: { scene_plan: { type: "array", items: { type: "string" } }, reused_components: { type: "array", items: { type: "string" } }, clashes: { type: "array", items: { type: "string" } }, vo_fit: { type: "string" } } };
const REVIEW_SCHEMA = { type: "object", additionalProperties: false, required: ["approved_plan", "review_notes"], properties: { approved_plan: { type: "array", items: { type: "string" } }, review_notes: { type: "array", items: { type: "string" } } } };

const refBlock = (refs?: string[]) => refs?.length ? `\n\nREFERENCE SET: this film must look like another film in the same set. Match their quality bar, colour use and brand components, but design a NEW layout and motion for this argument. Never copy their scene layouts or copy.\n${refs.map((r, n) => `--- reference ${n + 1} ---\n${r.slice(0, 14000)}`).join("\n")}` : "";

/** Report first, build second: the designer reports its plan, a reviewer checks it against the build prompt. */
async function reportAndReview(i: DesignInput): Promise<BuildReport | null> {
  if (!i.buildPrompt) return null;
  try {
    const rep = JSON.parse(await streamResponses([
      { role: "system", content: `You are the HyperFrames build agent. Read the build prompt, house rules, brand kit, supplied files and reference set, then REPORT BACK before building: scene plan (one line per scene with times, layout and components), components reused from the reference set, any clash with the prompt (timing, layout, safe area, claims), and whether each voiceover line fits its window. Do not build.\n\nHOUSE RULES:\n${i.houseRules ?? ""}\n\nBRAND KIT:\n${i.kit.slice(0, 10000)}${refBlock(i.references)}` },
      { role: "user", content: `${i.buildPrompt}\n\nFiles:\n${i.files.map((f) => `- ${f.path} | ${f.summary}`).join("\n")}\nVoice: ${i.audioSeconds.toFixed(1)}s` },
    ], REPORT_SCHEMA, "report")) as Omit<BuildReport, "approved_plan" | "review_notes">;
    const rev = JSON.parse(await streamResponses([
      { role: "system", content: "Review the proposed plan against the build prompt and house rules. Separate technical conflicts (timing, overclaims, safe zones, unavailable files) from creative weaknesses (audience insight, hook/payoff, evidence, composition, purposeful motion, pacing, ending and repetition). Return a corrected scene plan and explicit unresolved concerns in review_notes; do not invent missing evidence. Fix technical conflicts in the corrected scene plan. The recorded word timestamps supplied with the build are authoritative: make each visual explain the words currently being spoken, even if older proposed scene times disagree. Use concrete, comprehensible examples grounded in the supplied brief; explicitly label hypothetical examples and never invent customer outcomes. Avoid unexplained jargon. A text plan review is not approval of rendered visuals. No compulsory trust scene, UI or end-card hold." },
      { role: "user", content: `BUILD PROMPT:\n${i.buildPrompt}\n\nREPORT:\n${JSON.stringify(rep)}` },
    ], REVIEW_SCHEMA, "review")) as Pick<BuildReport, "approved_plan" | "review_notes">;
    if (!Array.isArray(rev.approved_plan) || !rev.approved_plan.length || !Array.isArray(rev.review_notes)) throw new Error("Incomplete scene review.");
    return { ...rep, ...rev, review_status: "reviewed" };
  } catch (e) {
    console.warn("[design] report/review failed", e);
    return { scene_plan: [], reused_components: [], clashes: ["Required plan report/review unavailable or invalid."], vo_fit: "Unreviewed", approved_plan: [], review_notes: ["Review failed; no creative approval established."], review_status: "failed" };
  }
}

const CONTRACT = `RENDER CONTRACT (the render server rejects anything else):
- Output ONE complete self-contained HTML document starting with <!doctype html>.
- <head> must include <script src="_lib/gsap/gsap.min.js"></script>. Only built-in _lib/ scripts and _fonts/ stylesheets (listed below) or the supplied @font-face CSS; no external URLs.
- Root: <div id="root" data-composition-id="main" data-start="0" data-duration="{D}" data-width="{W}" data-height="{H}"> filling {W}x{H} px. html,body fixed to {W}x{H}, overflow hidden.
- Every timed element has class="clip" data-start="s" data-duration="s" data-track-index="n" (seconds). data-track-index is only an editor lane: stacking order comes ONLY from CSS z-index. Scenes are clips.
- Animation: exactly one const tl = gsap.timeline({paused:true}); add every tween at absolute times (tl.fromTo(el,{...},{...,duration},t)); end with window.__timelines=window.__timelines||{}; window.__timelines["main"]=tl; tl.seek(0); Never call play(). No setTimeout/setInterval/requestAnimationFrame/Math.random/CSS @keyframes/CSS transitions. Explicit start values on every fromTo.
- Images/videos only by the exact supplied paths (e.g. src="assets/x.png"). <video> must be muted playsinline. Never invent a person or a logo; leave an image out rather than fake it.
- Build all interface elements (cards, chips, counters, toggles, checklists, device frames, caption bar) in HTML/CSS. Counters: tween a plain object and write textContent in onUpdate (deterministic).`;

function systemPrompt(i: DesignInput) {
  const [W, H] = i.size.split("x");
  return `You are Sam's creative motion designer writing bespoke HyperFrames (HTML + GSAP) compositions for the supplied sector, audience, objective and assets.
Choose a visual system that expresses this argument. Editorial typography, sensory footage, demonstration, observation, metaphor and guided tours are options.

RESEARCHED CREATIVE PRINCIPLES:
${CREATIVE_PLAYBOOK}

${CONTRACT.replace(/\{D\}/g, String(i.duration)).replace(/\{W\}/g, W!).replace(/\{H\}/g, H!)}

ART DIRECTION: the brand kit decides the look. Where it is silent, pick ONE motion language that fits this argument (e.g. product-demo with UI state changes, bold kinetic type on brand colour, before/after split, cursor-driven walkthrough) rather than a stock white-card slideshow.
- Choose a meaningful opening promise, development, supported evidence and resolution for this brief. Do not force a pain/problem/UI/proof/CTA sequence or use fake interface action as evidence. The hook can be a visual action or observation.
- Every second has composed content. Scene clips may overlap by 0.3 to 0.5s only as a named transition, and during the overlap only ONE headline is readable; never leave the stage empty.
- COMPOSITION: choose focal subject, hierarchy, crop and negative space per moment. Purposeful repeated composition may establish rhythm; arbitrary layout novelty is not quality.
- Motion and pacing must clarify meaning: justify reveals, continuity, contrast, stillness and transitions. Do not apply automatic drift, parallax or stagger to everything. Readability and evidence determine hold times.
- Ending: resolve the opening promise and choose one suitable next step. A payoff, loop, continuing action or held frame may work; pill CTA and fixed end-card hold are optional.
- IMAGE HANDLING (strict, enforced by an automatic check): each supplied file lists its inspected facts and a Treatment. Apply exactly that class (as-logo, as-portrait wrapper, as-portrait-cut, as-shot, as-cover); the CSS for these classes is injected for you, size them only with width/height/position. Never put a logo or person on a dark tile, never add borders/outlines/frames around logos, never use object-fit:contain on an opaque portrait. You can SEE the attached images: check backgrounds and crops yourself.
- CAPTIONS: do NOT build captions or a caption bar; real word-timed captions are added automatically inside the reserved caption strip below.
- TEXT: animate whole words only. Never split text into characters, no scrambles, typewriters or random glyphs. Give every text block a fixed-width box, max 2 lines for headlines, max ~7 words on screen at once.
${zonesBrief(zonesFor(Number(W), Number(H)))}
- Large phone-readable type (display >= 72 px, titles >= 48, body >= 28 at 1080 wide; scale proportionally for other sizes).

OFFICIAL HYPERFRAMES GUIDANCE (follow it):
${officialNotes}

BRAND KIT (authoritative for copy and visual rules; user-selected colour roles below take priority over inferred kit colours):
Selected brand colours: background ${i.palette.bg}, text ${i.palette.fg}, primary ${i.palette.primary ?? i.palette.accent}, accent ${i.palette.accent}.
${i.kit || "(No motion kit uploaded. Use the house style with these brand colours.)"}

${BUILTINS_BRIEF}

FONTS: ${i.fontCss ? `Paste this CSS into <style> and use font-family:"Brand",sans-serif everywhere (it is ${i.fontFamily}):\n${i.fontCss}` : builtinFontSlug(i.fontFamily) ? `The brand font ${i.fontFamily} is hosted: link _fonts/${builtinFontSlug(i.fontFamily)}/index.css and 700.css and use font-family:"${i.fontFamily}".` : "Pick ONE hosted font family above that suits the brand (a bold display face for headlines is fine as a second) and link its _fonts CSS."}

Write UK English. Never use an em dash. Use the approved on-screen copy verbatim and preserve the approved scene order. The kit guides visuals and typography. Do not invent, replace or shorten any on-screen copy.`;
}

function userPrompt(i: DesignInput) {
  return `Design this ${i.duration}s ${i.size} video for ${i.brand}.
Narrative: ${i.brief.narrative}
Hook (opening promise, not necessarily a headline): ${i.brief.hook}
Story beats (choose scene boundaries and durations for meaning): ${i.brief.beats.map((b, n) => `\n  ${n + 1}. ${b}`).join("")}
CTA: ${i.brief.cta}
Creative direction: ${i.brief.script}${i.brief.argument ? `\nSales argument this film must prove: ${i.brief.argument}` : ""}
Voiceover (${i.audioSeconds.toFixed(1)}s of audio): ${i.brief.voiceover}
Spoken word timings (word|start|end s), for pacing scenes: ${i.words.map((c) => `${c.word}|${c.start}|${c.end}`).join(" ")}
Measured word timings above are authoritative. Synchronise each relevant visual and heading with the words being spoken; do not use older fixed timestamps that contradict the recording. Show a concrete, understandable example or a clearly labelled hypothetical mechanism, then give the viewer an actionable takeaway. Use plain spoken language rather than abstract labels or repeated slogans. Do not invent evidence or claims.

Supplied files (use only these paths):
${i.files.length ? i.files.map((f) => `- ${f.path} | ${f.kind} | ${f.name}${f.summary ? ` | ${f.summary}` : ""}`).join("\n") : "- (none: design intentional typography/diagrams using verified facts; no invented product imagery or customer proof)"}
${i.previousHtml ? `\nREVISION. The client asked: "${i.revisionNote ?? ""}". Here is the previous design; keep what works and change what they asked for:\n${i.previousHtml.slice(0, 30000)}` : ""}

Return JSON: {"html": the full document, "notes": one sentence on the design}.`;
}

const SCHEMA = { type: "object", additionalProperties: false, required: ["html", "notes"], properties: { html: { type: "string" }, notes: { type: "string" } } };

/** Streams a Responses call and returns the final output text. */
export type Msg = { role: string; content: string | ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string })[] };
export async function streamResponses(input: Msg[], schema: object = SCHEMA, name = "composition"): Promise<string> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const r = await fetchOpenAI("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream: true, store: false, reasoning: { effort: name === "composition" ? "low" : "medium" }, input, text: { format: { type: "json_schema", name, strict: true, schema } } }),
  });
  if (!r.ok || !r.body) {
    await r.body?.cancel().catch(() => undefined);
    console.error(`[design] Request failed (${r.status})`);
    throw new Error(r.status === 402 ? "AI credits are used up." : r.status === 429 ? "Too many AI requests right now." : `Design failed (${r.status}).`);
  }
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = "", out = "", done = "", completed = false, ended = false;
  try { for (;;) {
    const { value, done: end } = await reader.read();
    if (end) { ended = true; break; }
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim(); if (!d || d === "[DONE]") continue;
      let ev: { type?: string; delta?: string; text?: string };
      try { ev = JSON.parse(d); } catch { continue; }
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.output_text.done" && ev.text) done = ev.text;
        else if (ev.type === "response.completed") completed = true;
        else if (ev.type === "response.failed" || ev.type === "response.incomplete" || ev.type === "error") throw new Error("Design failed before the provider confirmed completion.");
    }
  } } finally { if (!ended) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!completed) throw new Error("Design stream ended without confirmed completion; reconcile this attempt before retrying.");
  return done || out;
}

export function approvedCopyProblems(html: string, buildPrompt: string | null | undefined) {
  const scenes = readStoryboardSections(buildPrompt);
  if (!scenes.some((scene) => scene.copy.length)) return [];
  const excluded = new Set(["head", "script", "style", "template", "noscript"]);
  const texts: string[] = [];
  function collect(node: DefaultTreeAdapterMap["node"]) {
    if (node.nodeName === "#text" && "value" in node) texts.push(node.value);
    else if (!excluded.has(node.nodeName) && "childNodes" in node) node.childNodes.forEach(collect);
  }
  collect(parse(html));
  const visible = texts.join(" ").replace(/\s+/g, " ");
  return scenes.flatMap((scene, index) => scene.copy
    .filter((line) => !visible.includes(line.replace(/\s+/g, " ")))
    .map((line) => `Scene ${index + 1} is missing its approved on-screen copy: ${line}`));
}

/** Sam designs the video with the images in view; checks it; repairs up to twice; reports problems rather than falling back silently. */
export async function designComposition(i: DesignInput, allowedFiles: string[]): Promise<{ html: string | null; notes: string; problems: string[]; report: BuildReport | null }> {
  const report = await reportAndReview(i);
  if (report?.review_status === "failed") return { html: null, notes: "Plan review failed.", problems: report.clashes, report };
  const playbook = i.buildPrompt ? `\n\nBUILD PROMPT (creative intent; correct its timings to the measured spoken word timestamps above):\n${i.buildPrompt}${report ? `\n\nREVIEWED SCENE PLAN (align it with the measured narration timestamps):\n- ${report.approved_plan.join("\n- ")}` : ""}${refBlock(i.references)}` : "";
  const userContent: Msg["content"] = [{ type: "input_text", text: userPrompt(i) + playbook }, ...(i.images ?? []).flatMap((im) => [
    { type: "input_text" as const, text: `Image ${im.path}:` }, { type: "input_image" as const, image_url: im.dataUrl }])];
  const msgs: Msg[] = [{ role: "system", content: systemPrompt(i) }, { role: "user", content: userContent }];
  let problems: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await streamResponses(msgs);
    let parsed: { html?: string; notes?: string } = {};
    try { parsed = JSON.parse(raw); } catch { /* treat as invalid */ }
    const html = parsed.html ?? "";
    problems = html ? [
      ...validateComposition({ html, duration: i.duration, files: allowedFiles }),
      ...approvedCopyProblems(html, i.buildPrompt),
      ...mediaTreatmentProblems(html),
      ...zoneProblems(html, zonesFor(Number(i.size.split("x")[0]), Number(i.size.split("x")[1]))),
      ...coverageGaps(html, i.duration).map(([a, b]) => `Empty stage from ${a.toFixed(1)}s to ${b.toFixed(1)}s; overlap scenes so something is always on screen.`),
    ] : ["Return valid JSON with an html field."];
    if (!problems.length) return { html, notes: parsed.notes ?? "", problems: [], report };
    console.warn(`[design] attempt ${attempt + 1} problems: ${problems.join(" | ")}`);
    msgs.push({ role: "assistant", content: raw.slice(0, 60000) }, { role: "user", content: `Fix these problems and return the full corrected document:\n- ${problems.join("\n- ")}` });
  }
  return { html: null, notes: "", problems, report };
}
