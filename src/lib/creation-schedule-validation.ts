type ScheduleSelection = { account_ids?: string[] | undefined; immediate?: boolean | undefined };

/** Text-only posts cannot be delivered to Instagram; preserve the author's words for other channels. */
export function writtenPostCaptions(text: string, platforms: string[]): Record<string, string> {
  return Object.fromEntries(platforms.filter(platform => platform !== "instagram").map(platform => [platform, text]));
}

/** A start-now schedule publishes one first creation to every account used later. */
export function validScheduleSelection(accountIds: string[], items: ScheduleSelection[]): boolean {
  const allowed = new Set(accountIds);
  if (allowed.size !== accountIds.length) return false;
  const accounts = items.map(item => item.account_ids ?? accountIds);
  if (accounts.some(ids => ids.length === 0 || new Set(ids).size !== ids.length || ids.some(id => !allowed.has(id)))) return false;
  const immediate = items.flatMap((item, index) => item.immediate ? [index] : []);
  return immediate.length === 0 || (immediate.length === 1 && immediate[0] === 0 && accounts.every(ids => ids.every(id => accounts[0]!.includes(id))));
}
