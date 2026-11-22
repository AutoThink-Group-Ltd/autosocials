/** Read only notes linked from the exact saved public profile. */
export function extractSubstackNotes(markdown: string, handle: string, limit = 12) {
  const pattern = /\[([^\]]+)\]\((https:\/\/substack\.com\/@[\w.-]+\/note\/[\w-]+)(?:\s+"[^"]*")?\)/gi;
  const matches = [...markdown.matchAll(pattern)].filter(match => new URL(match[2]!).pathname.split("/")[1]?.slice(1).toLowerCase() === handle.toLowerCase()).slice(0, limit);
  return matches.map((match, index) => {
    const tail = markdown.slice(match.index! + match[0].length, matches[index + 1]?.index ?? undefined);
    const text = tail.match(/\[([^\]]{10,})\]\(https?:\/\/[^)]+\)/s)?.[1];
    const caption = (text ? `Shared link: ${text}` : "Public Substack note").replace(/\\+/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);
    const date = Date.parse(match[1]!);
    return { url: match[2]!, date: Number.isNaN(date) ? null : new Date(date).toISOString(), caption };
  });
}

/** Personal reviews use dated notes from the most recent 90 days only. */
export function recentPersonalNotes<T extends { date: string | null }>(notes: T[], now = Date.now()): T[] {
  const cutoff = now - 90 * 24 * 60 * 60_000;
  return notes.filter((note) => { const date = Date.parse(note.date ?? ""); return Number.isFinite(date) && date >= cutoff && date <= now; }).sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!)).slice(0, 20);
}
