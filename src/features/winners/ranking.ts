/** Ranking is deliberately confined to comparable posts and observed metrics. */
export type PerformancePost = {
  id: string;
  accountId: string;
  platform: string;
  format: string;
  publishedAt: string;
  measuredAt: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views?: number | null;
  reach?: number | null;
};

export type RankedPost = PerformancePost & {
  score: number | null;
  cohortSize: number;
  metricsUsed: ("likes" | "comments" | "shares" | "views" | "reach")[];
  percentile: number | null;
  reason: string;
};

type Metric = "likes" | "comments" | "shares" | "views" | "reach";
export type Comparison = "engagement" | "views" | "reach";
const day = 86_400_000;
export function isFreshMeasurement(measuredAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(measuredAt);
  return Number.isFinite(age) && age >= -300_000 && age <= 7 * day;
}

/** Compare posts with the same account, platform, format and age at measurement.
 * The result is descriptive, not a prediction of future or paid performance. */
export function rankPosts(posts: PerformancePost[], comparison: Comparison = "engagement"): RankedPost[] {
  const groups = new Map<string, PerformancePost[]>();
  const invalid: PerformancePost[] = [];
  for (const post of posts) {
    const age = (Date.parse(post.measuredAt) - Date.parse(post.publishedAt)) / day;
    if (!Number.isFinite(age) || age < 1) { invalid.push(post); continue; }
    const band = age < 7 ? "1–6 days" : age < 30 ? "7–29 days" : age < 90 ? "30–89 days" : age < 365 ? "90–364 days" : "365+ days";
    const key = JSON.stringify([post.accountId, post.platform, post.format, band]);
    const group = groups.get(key);
    if (group) group.push(post); else groups.set(key, [post]);
  }
  const result: RankedPost[] = invalid.map(post => ({ ...post, score: null, cohortSize: 0, metricsUsed: [], percentile: null, reason: "Not enough observation time or an invalid measurement date." }));
  for (const group of groups.values()) {
    const metrics: Metric[] = comparison === "engagement" ? ["likes", "comments", "shares"] : [comparison];
    const shared = metrics.filter(metric => group.every(post => typeof post[metric] === "number" && Number.isFinite(post[metric]) && post[metric]! >= 0));
    const comparable = group.length >= 3 && shared.length > 0;
    const scores = group.map(post => shared.reduce((sum, metric) => sum + post[metric]!, 0));
    const sorted = [...scores].sort((a, b) => a - b);
    group.forEach((post, index) => {
      const score = comparable ? scores[index]! : null;
      let lo = 0, hi = sorted.length;
      if (score !== null) while (lo < hi) { const mid = (lo + hi) >>> 1; if (sorted[mid]! < score) lo = mid + 1; else hi = mid; }
      const lower = score === null ? 0 : lo;
      result.push({ ...post, score, cohortSize: group.length, metricsUsed: shared, percentile: score === null ? null : Math.round(lower / (group.length - 1) * 100), reason: comparable ? `Compared ${shared.join(", ")} with ${group.length} posts from the same account, platform, format and age band.` : "At least three comparable posts and one shared metric are needed." });
    });
  }
  return result.sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1));
}
