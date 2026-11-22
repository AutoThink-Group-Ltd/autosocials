import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarClock, CircleAlert, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

type OverviewPost = { id: string; caption: string; status: string; scheduled_at: string | null; post_targets: { platform: string; status: string }[]; post_media: { url?: string; kind: string }[] };

export function PublishingOverview({ posts, timezone, onOpen }: { posts: OverviewPost[]; timezone: string; onOpen: (id: string) => void }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const scheduled = posts.filter(p => p.status === "scheduled" && p.scheduled_at).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  const next = scheduled[0];
  const attention = posts.filter(p => ["failed", "needs_attention", "partially_published"].includes(p.status)).length;
  if (!next && !attention) return null;
  const seconds = next && now !== null ? Math.max(0, Math.ceil((Date.parse(next.scheduled_at!) - now) / 1000)) : null;
  const remaining = seconds === null ? "" : seconds === 0 ? "Due now" : seconds >= 86400 ? `In ${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h` : seconds >= 3600 ? `In ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `In ${Math.max(1, Math.ceil(seconds / 60))}m`;
  return <section aria-label="Publishing overview" className="flex shrink-0 flex-wrap items-center gap-4 border-b bg-muted/30 px-5 py-3">
    {next && <><span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Radio className="h-5 w-5 motion-safe:animate-pulse" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next scheduled post</p><p className="truncate text-sm font-semibold">{next.caption || "Untitled post"}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(next.scheduled_at!))} · {timezone} · {[...new Set(next.post_targets.map(t => t.platform))].join(" / ")}</p></div><div className="text-right"><p className="text-sm font-semibold">{remaining || "Scheduled"}</p><p className="text-xs text-muted-foreground">{scheduled.length} scheduled</p></div><Button type="button" variant="outline" size="sm" onClick={() => onOpen(next.id)}>View post <ArrowUpRight className="ml-1 h-4 w-4" /></Button></>}
    {attention > 0 && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs text-destructive"><CircleAlert className="h-4 w-4" />{attention} {attention === 1 ? "post needs" : "posts need"} attention</div>}
    {!next && <span className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />No upcoming posts</span>}
  </section>;
}
