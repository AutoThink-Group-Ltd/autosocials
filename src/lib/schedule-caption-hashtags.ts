import { validChannelCaption } from "./schedule-caption-length";

export const scheduleHashtagGuidance = "Include hashtags specific to each post's subject: two for LinkedIn, three for Instagram, one for Facebook or X. Keep them within the caption limit. Avoid generic reach tags.";

// Older approved copy bypasses the caption writer. Rank words from that copy
// by recurrence and give its opening line extra weight.
const stopWords = new Set("about above after again against almost along already also always another anyone anything around available away because become before being below better between both business cannot come could does doing done each enough even every first from full give going good great have here into just keep know last like made make many might more most much must need next much our ours only other over post posts really ready right said same should some still such take than that their them then there these they thing think this those through time under very want well with were what when where which while will with without would your yours".split(" "));

export function scheduleCaptionWithHashtags(text: string, platform: string): string {
  const body = text.trimEnd();
  const wordsOnly = body.replace(/https?:\/\/\S+|@[\p{L}\p{N}_]+/giu, " ");
  if (/(?:^|\s)#[\p{L}][\p{L}\p{M}\p{N}_]*/u.test(wordsOnly)) return text;
  const scores = new Map<string, number>();
  const opening = wordsOnly.split(/[.!?\n]/, 1)[0].toLowerCase();
  for (const word of wordsOnly.match(/[\p{L}][\p{L}\p{M}\p{N}]+/gu) ?? []) {
    const key = word.toLowerCase();
    if (stopWords.has(key) || (word.length < 4 && !/^[A-Z]{2,3}$/.test(word))) continue;
    scores.set(key, (scores.get(key) ?? (opening.includes(key) ? 1 : 0)) + 1);
  }
  let result = body;
  let count = 0;
  const target = platform === "instagram" ? 3 : platform === "linkedin" ? 2 : 1;
  for (const [word] of [...scores].sort((a, b) => b[1] - a[1])) {
    const tag = word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1);
    const next = result + (count ? " " : "\n\n") + "#" + tag;
    if (!validChannelCaption(next, platform)) continue;
    result = next;
    if (++count === target) break;
  }
  return count ? result : text;
}
