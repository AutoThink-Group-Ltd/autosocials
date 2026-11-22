import type { QuoteEvidence } from "./social-design";

// Verbatim excerpts checked against the cited original publications.
export const founderQuotes: readonly QuoteEvidence[] = [
  {
    text: "And the only way to do great work is to love what you do.",
    speaker: "Steve Jobs",
    sourceTitle: "Stanford commencement address, 2005",
    sourceUrl:
      "https://news.stanford.edu/stories/2005/06/youve-got-find-love-jobs-says",
  },
  {
    text: "You can't wait for users to come to you. You have to go out and get them.",
    speaker: "Paul Graham",
    sourceTitle: "Do Things that Don't Scale",
    sourceUrl: "https://paulgraham.com/ds.html",
  },
  {
    text: "Take whatever you think your product should be and cut it in half.",
    speaker: "37signals",
    sourceTitle: "Getting Real, Half, Not Half-Assed",
    sourceUrl: "https://basecamp.com/gettingreal/05.1-half-not-half-assed",
  },
];

export function wantsQuotations(brief: string) {
  return (
    /\b(?:quotes?|quotations?|aphorisms?)\b/i.test(brief) &&
    !/\b(?:price|cost|credit) quotes?\b/i.test(brief)
  );
}
export function quotePlanningContext(brief: string) {
  if (!wantsQuotations(brief)) return "";
  return (
    "Verified primary-source examples for founders, only when relevant to the requested speaker and topic: " +
    JSON.stringify(founderQuotes)
  );
}
