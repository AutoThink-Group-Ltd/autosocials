import { isFreshMeasurement } from "@/features/winners/ranking";

/** A finding expires as soon as any of its supporting measurements does. */
export function freshWinnerEvidence(value: unknown, now = Date.now()): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every(item =>
    item && typeof item === "object" && item.analysis_method === "reviewed_v3" && typeof item.measured_at === "string" && isFreshMeasurement(item.measured_at, now));
}

/** Metric comparisons are rendered deterministically from evidence, never prose. */
export function containsPerformanceClaim(value: string): boolean {
  return /\b(?:high(?:er|est)?|low(?:er|est)?|top|bottom|middle|best|better|worse|worst|strong(?:er|est)?|weak(?:er|est)?|outperform(?:s|ed|ing)?|underperform(?:s|ed|ing)?|percentile|rank(?:s|ed|ing)?|engagement|perform(?:s|ed|ing|ance)?|results?|winning|winner|more successful|less successful)\b/i.test(value);
}
