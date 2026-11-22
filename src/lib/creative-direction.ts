/** Pure creative contract. Heuristics flag repetition; they do not certify originality. */
export const DIRECTION_AXES = ["argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending"] as const;
const fields = ["audience", "objective", "insight", ...DIRECTION_AXES, "typography", "sound", "evidence", "asset_strategy"] as const;
export type CreativeDirection = Record<(typeof fields)[number], string>;
export const CREATIVE_DIRECTION_SCHEMA = {
  type: "object", additionalProperties: false, required: [...fields],
  properties: Object.fromEntries(fields.map((field) => [field, { type: "string", minLength: 1 }])),
} as const;

export function parseCreativeDirection(value: unknown): CreativeDirection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (fields.some((field) => typeof record[field] !== "string" || !(record[field] as string).trim())) return null;
  return Object.fromEntries(fields.map((field) => [field, (record[field] as string).trim()])) as CreativeDirection;
}
export function creativeDirectionText(direction: CreativeDirection): string {
  return fields.map((field) => `${field.replace(/_/g, " ")}: ${direction[field]}`).join("\n");
}
export type CreativeCandidate = { hook: string; cta?: string; argument?: string; beats?: string[]; script?: string; direction?: CreativeDirection | null };
export type CreativeHistoryEntry = CreativeCandidate & { workspace_id: string; brand_profile_id?: string | null };
export function scopedCreativeHistory(history: CreativeHistoryEntry[], scope: { workspaceId: string; brandProfileId?: string | null }): CreativeHistoryEntry[] {
  return history.filter((entry) => entry.workspace_id === scope.workspaceId && (!scope.brandProfileId || entry.brand_profile_id === scope.brandProfileId)).slice(0, 12);
}

const stop = new Set("a an the this that with for and of to in on from your our is are as by one film video scene brand product show use using then".split(" "));
const aliases: Record<string, string> = { saves: "save", saving: "save", saved: "save", hours: "time", minutes: "time", busywork: "manual", workload: "manual", automation: "automate", automated: "automate", automates: "automate", reveals: "reveal", revealing: "reveal", showcase: "reveal", demonstration: "demo", walkthrough: "demo", kinetic: "type", typography: "type", typographic: "type", split: "comparison", versus: "comparison", compare: "comparison", testimonial: "customer", testimonialled: "customer", montage: "sequence", cuts: "cut", cutting: "cut", zooms: "zoom", panning: "pan", pans: "pan", stills: "photo", photographs: "photo", photos: "photo", packshots: "packshot", interfaces: "ui", interface: "ui", dashboards: "ui", dashboard: "ui", buttons: "button", pill: "button", endcard: "endcard", logo: "brandmark" };
const tokens = (text: string) => new Set(text.toLowerCase().replace(/end[ -]card/g, "endcard").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !stop.has(token)).map((token) => aliases[token] ?? token));
export function creativeSimilarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  const intersection = [...x].filter((token) => y.has(token)).length;
  return intersection / Math.min(x.size, y.size);
}
function axis(candidate: CreativeCandidate, name: (typeof DIRECTION_AXES)[number]): string {
  return candidate.direction?.[name] ?? (name === "hook" ? candidate.hook : name === "argument" ? candidate.argument ?? "" : name === "composition" ? candidate.beats?.[0] ?? "" : "");
}
/** Pass only recent history from the authorised workspace/brand. Bounded repair must preserve unresolved findings. */
export function directionDiversityProblems(items: CreativeCandidate[], history: CreativeCandidate[] = []): string[] {
  const problems: string[] = [];
  items.forEach((candidate, index) => {
    const comparisons = [...items.slice(0, index).map((item, n) => ({ item, label: `asset ${n + 1}` })), ...history.slice(0, 12).map((item, n) => ({ item, label: `recent asset ${n + 1}` }))];
    for (const { item, label } of comparisons) {
      const repeated = DIRECTION_AXES.filter((name) => creativeSimilarity(axis(candidate, name), axis(item, name)) >= 0.72);
      const structural = repeated.filter((name) => !["hook", "argument"].includes(name));
      if (repeated.includes("hook")) problems.push(`Asset ${index + 1} repeats the hook of ${label}; change the opening promise and visual, not synonyms.`);
      if ((repeated.includes("argument") && structural.length >= 2) || structural.length >= 4) problems.push(`Asset ${index + 1} repeats the creative mechanism of ${label} across ${repeated.join(", ")}; change the audience argument or story and visual grammar.`);
    }
  });
  return [...new Set(problems)];
}
