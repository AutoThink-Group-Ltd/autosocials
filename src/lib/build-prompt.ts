// Pure: Hamza's playbook build prompt as structured data, its checks and its Markdown form.
// Shared by the planner (server), the briefs screen and tests.

export type Scene = { name: string; start: number; end: number; on_screen: string[]; action: string; files: string[]; sound: string };
export type VoLine = { in: number; out: number; line: string };
export type BuildPrompt = {
  different: string; opening_visual: string; dont_open_on: string[]; story: string; feel: string;
  sample_data: string[]; scenes: Scene[]; vo: VoLine[]; trust_beat: string;
  sfx: string[]; music: string; guardrails: string[]; checklist: string[]; review_times: number[];
};
export type Facts = { does: string[]; does_not: string[]; banned_claims: string[]; banned_colours: string[] };

const STR = { type: "string" };
const STRS = { type: "array", items: STR };
const NUM = { type: "number" };
export const BUILD_PROMPT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["different", "opening_visual", "dont_open_on", "story", "feel", "sample_data", "scenes", "vo", "trust_beat", "sfx", "music", "guardrails", "checklist", "review_times"],
  properties: {
    different: STR, opening_visual: STR, dont_open_on: STRS, story: STR, feel: STR, sample_data: STRS,
    scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "start", "end", "on_screen", "action", "files", "sound"], properties: { name: STR, start: NUM, end: NUM, on_screen: STRS, action: STR, files: STRS, sound: STR } } },
    vo: { type: "array", items: { type: "object", additionalProperties: false, required: ["in", "out", "line"], properties: { in: NUM, out: NUM, line: STR } } },
    trust_beat: STR, sfx: STRS, music: STR, guardrails: STRS, checklist: STRS, review_times: { type: "array", items: NUM },
  },
} as const;

export const MAX_WORDS_PER_SECOND = 2.1;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Every rule from the house rules that can be checked without a human. */
export function checkBuildPrompt(p: BuildPrompt, o: { duration: number; facts?: Facts | null; files?: string[] }): string[] {
  const out: string[] = [];
  const sc = [...p.scenes].sort((a, b) => a.start - b.start);
  if (!sc.length) out.push("Needs at least one intentional scene.");
  for (const scene of sc) if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.end <= scene.start || scene.start < 0 || scene.end > o.duration + 0.01) out.push(`Invalid timing for scene "${scene.name}".`);
  if (sc.length && Math.abs(sc[0]!.start) > 0.05) out.push("The first scene must start at 0.0s (frame 1 shows the idea).");
  for (let i = 1; i < sc.length; i++) if (Math.abs(sc[i]!.start - sc[i - 1]!.end) > 0.05) out.push(`Gap or overlap between "${sc[i - 1]!.name}" and "${sc[i]!.name}".`);
  if (sc.length && Math.abs(sc[sc.length - 1]!.end - o.duration) > 0.05) out.push(`Scenes must end at exactly ${o.duration}.0s.`);
  for (const v of p.vo) {
    const len = v.out - v.in;
    if (len <= 0) { out.push(`Voiceover line "${v.line.slice(0, 30)}" has no time window.`); continue; }
    if (v.out > o.duration + 0.01) out.push(`Voiceover line "${v.line.slice(0, 30)}" runs past the end.`);
    if (words(v.line) / len > MAX_WORDS_PER_SECOND) out.push(`Voiceover line "${v.line.slice(0, 30)}" is ${(words(v.line) / len).toFixed(1)} words a second; plan at about 2.`);
  }
  const copy = [...sc.flatMap((s) => s.on_screen), ...p.vo.map((v) => v.line)];
  for (const c of copy) {
    if (/[—–]/.test(c)) out.push(`Em dash in "${c.slice(0, 40)}".`);
    if (/\$\s?\d|\bUSD\b/.test(c)) out.push(`Dollars in "${c.slice(0, 40)}"; use £.`);
  }
  const banned = (o.facts?.banned_claims ?? []).map((b) => b.toLowerCase().trim()).filter(Boolean);
  for (const c of copy) for (const b of banned) if (c.toLowerCase().includes(b)) out.push(`Banned claim "${b}" in "${c.slice(0, 40)}".`);
  if (o.files) { const ok = new Set(o.files); for (const s of sc) for (const f of s.files) if (!ok.has(f)) out.push(`Scene "${s.name}" uses a file that isn't this brand's: ${f}.`); }
  if (!p.dont_open_on.length) out.push("List what this video must not open on.");
  if (p.review_times.some((t) => t < 0 || t > o.duration)) out.push("Review still times must sit inside the video.");
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 6).join(" ");

/** In a test set every ad opens differently: different hook line and different opening visual. */
export function batchOpeningProblems(items: { hook: string; opening_visual: string }[]): string[] {
  const p: string[] = [];
  const dup = (xs: string[]) => { const k = xs.map(norm).filter(Boolean); return new Set(k).size < k.length; };
  if (dup(items.map((i) => i.hook))) p.push("Two videos open on the same hook.");
  if (dup(items.map((i) => i.opening_visual))) p.push("Two videos open on the same visual.");
  return p;
}

const t = (n: number) => `${n.toFixed(1)}s`;

/** The playbook's 13-section prompt, in the order Hamza writes it. */
export function buildPromptMarkdown(p: BuildPrompt, o: { brand: string; duration: number; size: string; hook: string; tokens?: string; route?: { style: string; engines: string; native: boolean; providerScenes: boolean } }): string {
  const [W, H] = o.size.split("x");
  const frames = Math.round(o.duration * 30);
  return [
    `# ${o.brand}: "${o.hook}" (build prompt, ${o.size})`,
    o.route ? `## Production route\n- Style: ${o.route.style}\n- Model: ${o.route.engines}\n- ${o.route.native ? "This provider produces the finished film. Follow its documented duration, format and audio controls." : o.route.providerScenes ? "Create the planned model scenes as ingredients, then assemble the finished film with HyperFrames." : "Build the finished composition in HyperFrames."}\n- This is a new ad, separate from every earlier ${o.brand} ad.` : `Build this in a **new, empty project**. It is a new ad, separate from every earlier ${o.brand} ad.`,
    `## What makes this one different\n${p.different}\n- **Do not open on:** ${p.dont_open_on.join("; ")}.\n- **Opens on:** ${p.opening_visual}.\n- **Feel:** ${p.feel}.\n- **Trust beat:** ${p.trust_beat}.`,
    `## The story\n${p.story}`,
    `## Deliverables\n- ${W}x${H}, 30fps, exactly ${o.duration.toFixed(3)}s (${frames} frames).\n- Review stills at ${p.review_times.map(t).join(", ")}.`,
    `## Brand tokens\n${o.tokens || "From the brand kit."}\n- Safe area and minimum type sizes from the house rules. Captions are added automatically from real word timings.`,
    `## Demonstration data (masked and identified as illustrative when needed)\n${p.sample_data.map((d) => `- ${d}`).join("\n")}`,
    `## Scene by scene\n${p.scenes.map((s, i) => `### Scene ${i + 1}: ${s.name} (${t(s.start)} to ${t(s.end)})\n${s.on_screen.map((l) => `- On screen: **${l}**`).join("\n")}\n- ${s.action}${s.files.length ? `\n- Files: ${s.files.join(", ")}` : ""}${s.sound ? `\n- Sound: ${s.sound}` : ""}`).join("\n\n")}`,
    `## Voiceover (about 2 words a second)\n| In | Out | Words | Line |\n|---|---|---|---|\n${p.vo.map((v) => `| ${t(v.in)} | ${t(v.out)} | ${words(v.line)} | ${v.line} |`).join("\n")}`,
    `## Audio\n- ${o.route?.native ? "Use only the selected provider's documented native audio controls." : "Narrator: one continuous take, timed to the approved voiceover."}\n- Music: ${p.music}\n- SFX: ${p.sfx.join("; ") || "none"}`,
    `## Guardrails\n${p.guardrails.map((g) => `- ${g}`).join("\n")}\n- No em dashes in on-screen copy. UK English, £.`,
    `## Before building\nReport back first: scene plan, components reused from the reference set, any clash with this prompt, whether each voiceover line fits its window. Then build.`,
    `## Acceptance checklist\n${p.checklist.map((c) => `- [ ] ${c}`).join("\n")}`,
  ].join("\n\n");
}

/** The on-screen words are the lines explicitly marked as copy in the saved storyboard. */
export function readStoryboardSections(prompt: string | null | undefined) {
  return (prompt ?? "").split(/^### Scene \d+: /m).slice(1).flatMap((chunk) => {
    const lines = (chunk.split(/^## /m)[0] ?? "").trim().split(/\r?\n/);
    const heading = lines[0]?.match(/^(.+) \(([\d.]+)s to ([\d.]+)s\)$/);
    if (!heading || Number(heading[3]) <= Number(heading[2])) return [];
    return [{
      name: heading[1]!,
      start: Number(heading[2]),
      end: Number(heading[3]),
      copy: lines.filter((line) => line.startsWith("- On screen:")).map((line) => line.slice(12).trim().replace(/^\*\*(.*)\*\*$/, "$1")).filter(Boolean),
      action: lines.filter((line) => line.startsWith("- ") && !/^- (On screen|Files|Sound):/.test(line)).map((line) => line.slice(2).trim()).join(" "),
      files: lines.find((line) => line.startsWith("- Files:")) ?? "",
    }];
  });
}

export function readStoryboardVoiceover(prompt: string | null | undefined, approvedVoiceover: string) {
  const section = prompt?.split(/^## Voiceover[^\n]*$/m)[1]?.split(/^## /m)[0] ?? "";
  const lines = section.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\|\s*([\d.]+)s\s*\|\s*[\d.]+s\s*\|\s*\d+\s*\|\s*(.*?)\s*\|$/);
    return match?.[2] ? [{ start: Number(match[1]), copy: match[2] }] : [];
  });
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  return normalize(lines.map(line => line.copy).join(" ")) === normalize(approvedVoiceover) ? lines : [];
}
