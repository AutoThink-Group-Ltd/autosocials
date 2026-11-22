type PriorFinding = { finding_key: string; title: string; source_post_ids: string[] };
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** Reuse a dismissed finding's identity when the same insight is regenerated. */
export function dismissedFindingKey(title: string, ids: string[], prior: PriorFinding[]): string | null {
  const current = words(title);
  for (const old of prior) {
    const previous = words(old.title);
    const intersection = [...current].filter(word => previous.has(word)).length;
    const union = new Set([...current, ...previous]).size;
    const similarity = union ? intersection / union : 0;
    const overlap = ids.some(id => old.source_post_ids.includes(id));
    if (similarity >= 0.8 || (overlap && similarity >= 0.6)) return old.finding_key;
  }
  return null;
}
