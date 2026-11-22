// Server-only: Hamza's HyperFrames playbook as Sam's rulebook, the brand facts sheet,
// and the full build prompt Sam writes for each asset before anything is designed.
import houseRules from "../../prompts/playbook/house-rules.md?raw";
import template from "../../prompts/playbook/build-prompt-template.md?raw";
import creativePrinciples from "../../prompts/playbook/creative-principles.md?raw";
import { aiChat, loadDossierContext } from "./dossier.server";
import { BUILD_PROMPT_SCHEMA, checkBuildPrompt, buildPromptMarkdown, type BuildPrompt, type Facts } from "./build-prompt";
import { readProductionPlan } from "./production-plan";
import { readVideoStyle, styleEngineLabel } from "./video-styles";
import type { getAdminClient } from "./supabase-admin.server";

type Admin = ReturnType<typeof getAdminClient>;
export const HOUSE_RULES = houseRules;
export const CREATIVE_PLAYBOOK = creativePrinciples;
/** Compatibility export: principles replace universal campaign-example anchoring. */
export const PLAYBOOK_EXAMPLE = creativePrinciples;

const EMPTY: Facts = { does: [], does_not: [], banned_claims: [], banned_colours: [] };
const FACTS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["does", "does_not", "banned_claims", "banned_colours", "sources"],
  properties: {
    does: { type: "array", items: { type: "string" } }, does_not: { type: "array", items: { type: "string" } },
    banned_claims: { type: "array", items: { type: "string" } }, banned_colours: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
  },
} as const;

export async function getFacts(admin: Admin, ws: string): Promise<Facts | null> {
  const { data } = await admin.from("brand_facts").select("does,does_not,banned_claims,banned_colours").eq("workspace_id", ws).maybeSingle();
  return data ?? null;
}

/** Facts sheet from the website scan, dossier and brand docs: facts only, with where each came from. */
export async function buildFactsSheet(admin: Admin, ws: string, kit: string, userId?: string): Promise<Facts> {
  const dossier = await loadDossierContext(ws);
  const json = await aiChat({
    model: "openai/gpt-6-astra", reasoning_effort: "low",
    messages: [
      { role: "system", content: `Write a site-facts sheet for ad production, following the playbook: facts only. 'does': what the product verifiably does (max 15, short). 'does_not': things people might assume but it does NOT do (max 10). 'banned_claims': short phrases that must never appear in an ad for this brand: the playbook defaults (never miss, 24/7, instant, fastest, guaranteed, works while you sleep) that would overclaim here, plus anything the brand docs ban. 'banned_colours': colours the brand bans as interface colours, with the reason. 'sources': where the facts came from. Never invent prices or numbers.` },
      { role: "user", content: `${dossier}\n\nBRAND KIT:\n${kit.slice(0, 14000)}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "facts", strict: true, schema: FACTS_SCHEMA } },
  });
  const raw = json.choices?.[0]?.message?.content;
  const f = raw ? (JSON.parse(raw) as Facts & { sources: string[] }) : { ...EMPTY, sources: [] };
  await admin.from("brand_facts").upsert({ workspace_id: ws, does: f.does, does_not: f.does_not, banned_claims: f.banned_claims, banned_colours: f.banned_colours, sources: f.sources, updated_by: userId ?? null, updated_at: new Date().toISOString() });
  return f;
}

export async function ensureFacts(admin: Admin, ws: string, kit: string, userId?: string) {
  return (await getFacts(admin, ws)) ?? (await buildFactsSheet(admin, ws, kit, userId).catch(() => EMPTY));
}

export function factsText(f: Facts | null) {
  if (!f) return "";
  return `FACTS SHEET (every on-screen and spoken claim must be supported here):\nDoes: ${f.does.join("; ")}\nDoes NOT: ${f.does_not.join("; ")}\nNever say: ${f.banned_claims.join("; ")}\nBanned interface colours: ${f.banned_colours.join("; ")}`;
}

type Asset = { id: string; hook: string; narrative: string; argument: string | null; beats: string[]; voiceover: string; cta: string; script: string; duration_s: number; size: string; files: { path: string; name: string; note: string }[]; production_plan?: unknown };

/** One full playbook build prompt per asset, checked and repaired once. Earlier openings are passed so the set differs. */
export async function writeBuildPrompt(a: Asset, o: { brand: string; kit: string; facts: Facts | null; otherOpenings: string[] }) {
  const style = readVideoStyle(a.production_plan);
  const plan = readProductionPlan(a.production_plan);
  const native = plan.steps.some((step) => step.role === "finished_video");
  const providerScenes = plan.steps.length > 0 && !native;
  const route = style ? { style: style.name, engines: styleEngineLabel(style), native, providerScenes } : undefined;
  const sys = `You are Sam's creative director writing a bespoke ${style ? `${style.name} (${styleEngineLabel(style)}) storyboard and production handoff` : "HyperFrames build prompt"} for this audience, sector, evidence and available assets. Follow the production rules and adaptive brief; choose structure, medium and visual grammar for this particular argument. ${native ? "The selected provider makes the finished film; do not prescribe HyperFrames composition or compositor voice as if they were the video engine." : providerScenes ? "The selected provider makes scene ingredients; HyperFrames assembles the final film. Give each provider scene a purposeful role." : "HyperFrames makes the finished branded composition."}

HOUSE RULES:\n${houseRules}\n\n${providerScenes || native ? "STORYBOARD STRUCTURE (adapt to the selected model, never treat a HyperFrames template as the generator):" : "TEMPLATE:"}\n${providerScenes || native ? "Use the structured scene, voiceover, evidence, audio and acceptance sections below. Match the selected model's documented capabilities and the production steps supplied with the brief." : template}\n\nRESEARCHED CREATIVE PRINCIPLES (apply judgment; never copy campaigns):\n${creativePrinciples}

${factsText(o.facts)}

BRAND KIT:\n${o.kit.slice(0, 12000)}

Return the prompt as structured JSON. Scenes run back to back from 0 to exactly ${a.duration_s}s; frame 1 already shows the idea. 'on_screen' lines are the exact headlines (short, no em dashes, UK English, £). 'vo' is the narrator written for the ear at about 2 words a second, line windows inside the video; its lines joined must equal the voiceover you are given or a tightened version of it. 'files' only from the supplied paths. 'sample_data' only when necessary: masked illustrative data must be identified as such if it could be mistaken for genuine customer evidence. Never invent testimonials, results or performance. 'review_times' are 6 to 8 timestamps inside the video on meaningful beats. 'trust_beat' names the supported evidence or honest reason to believe; it need not be a separate scene. No mandatory interface, scene count or fixed ending. Different hook and opening from: ${o.otherOpenings.join(" | ") || "(first in set)"}.`;
  const user = `Brand ${o.brand}. ${a.duration_s}s, ${a.size}.\nNarrative: ${a.narrative}\nArgument: ${a.argument ?? ""}\nHook: ${a.hook}\nBeats: ${a.beats.join(" / ")}\nDirection: ${a.script}\nSelected production route: ${route ? JSON.stringify(route) : "Legacy HyperFrames composition"}\nProvider steps: ${JSON.stringify(plan.steps)}\nVoiceover: ${a.voiceover}\nCTA: ${a.cta}\nFiles:\n${a.files.map((f) => `- ${f.path} | ${f.name} | ${f.note}`).join("\n") || "- none"}`;
  const msgs: { role: string; content: string }[] = [{ role: "system", content: sys }, { role: "user", content: user }];
  let p: BuildPrompt | null = null; let issues: string[] = [];
  for (let i = 0; i < 2; i++) {
    const json = await aiChat({ model: "openai/gpt-6-astra", reasoning_effort: "medium", messages: msgs, response_format: { type: "json_schema", json_schema: { name: "build_prompt", strict: true, schema: BUILD_PROMPT_SCHEMA } } });
    const raw = json.choices?.[0]?.message?.content;
    try { p = raw ? (JSON.parse(raw) as BuildPrompt) : null; } catch { p = null; }
    if (!p) { issues = ["Sam couldn't write the build prompt."]; continue; }
    issues = checkBuildPrompt(p, { duration: a.duration_s, facts: o.facts, files: a.files.map((f) => f.path) });
    if (!issues.length) break;
    msgs.push({ role: "assistant", content: raw! }, { role: "user", content: `Fix these and return the whole prompt again:\n- ${issues.join("\n- ")}` });
  }
  if (!p) return null;
  return { data: p, issues, markdown: buildPromptMarkdown(p, { brand: o.brand, duration: a.duration_s, size: a.size, hook: a.hook, route }) };
}
