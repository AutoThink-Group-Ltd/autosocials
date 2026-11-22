export type ClientStatusKey = "disconnected" | "attention" | "approval" | "scheduled" | "drafts" | "empty";

export interface PostLite {
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
}

export interface ClientSummary {
  status: ClientStatusKey;
  scheduled: number;
  publishedThisWeek: number;
  drafts: number;
  failed: number;
  awaiting: number;
  nextScheduledAt: string | null;
  lastPublishedAt: string | null;
}

/** Status priority: disconnected > failed > awaiting approval > scheduled > drafts > no content. */
export function summarizeClient(posts: PostLite[], linkActive = true, now = new Date()): ClientSummary {
  const weekAgo = now.getTime() - 7 * 86400000;
  let scheduled = 0, publishedThisWeek = 0, drafts = 0, failed = 0, awaiting = 0;
  let next: string | null = null, last: string | null = null;
  for (const p of posts) {
    if (p.status === "scheduled" || p.status === "publishing") {
      scheduled++;
      if (p.scheduled_at && (!next || p.scheduled_at < next)) next = p.scheduled_at;
    } else if (p.status === "draft") drafts++;
    else if (p.status === "failed") failed++;
    else if (p.status === "awaiting_approval") awaiting++;
    else if (p.status === "published" && p.published_at) {
      if (new Date(p.published_at).getTime() >= weekAgo) publishedThisWeek++;
      if (!last || p.published_at > last) last = p.published_at;
    }
  }
  const status: ClientStatusKey = !linkActive ? "disconnected"
    : failed > 0 ? "attention"
    : awaiting > 0 ? "approval"
    : scheduled > 0 ? "scheduled"
    : drafts > 0 ? "drafts"
    : "empty";
  return { status, scheduled, publishedThisWeek, drafts, failed, awaiting, nextScheduledAt: next, lastPublishedAt: last };
}
