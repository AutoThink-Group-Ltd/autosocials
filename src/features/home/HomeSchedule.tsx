import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { calendarDays, dateKey, shiftCursor, workspaceInstant } from "@/features/schedule/planner";

export function HomeSchedule({ workspaceId }: { workspaceId: string }) {
  const zone = useQuery({
    queryKey: ["home-schedule-zone", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("timezone").eq("id", workspaceId).single();
      if (error) throw error;
      return data.timezone || "UTC";
    },
  });
  const today = dateKey(new Date(), zone.data || "UTC");
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<"month" | "week">("month");
  const anchor = cursor ?? today;
  const days = calendarDays(anchor, view);
  const start = days[0]!;
  const end = format(addDays(new Date(days[days.length - 1] + "T12:00:00"), 1), "yyyy-MM-dd");
  const schedule = useQuery({
    queryKey: ["personal-home-schedule", workspaceId, start, end, zone.data],
    enabled: !!zone.data,
    queryFn: async () => {
      const from = workspaceInstant(start, "00:00", zone.data!);
      const until = workspaceInstant(end, "00:00", zone.data!);
      const data: Array<{ id: string; caption: string; status: string; published_at: string | null; scheduled_at: string | null; post_targets: { platform: string }[]; post_media: { storage_path: string; kind: string; position: number }[] }> = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from("posts")
          .select("id,caption,status,published_at,scheduled_at,post_targets(platform),post_media(storage_path,kind,position)")
          .eq("workspace_id", workspaceId).in("status", ["scheduled", "published"])
          .or(`and(published_at.gte.${from},published_at.lt.${until}),and(published_at.is.null,scheduled_at.gte.${from},scheduled_at.lt.${until})`)
          .order("id").range(offset, offset + 999);
        if (page.error) throw page.error;
        data.push(...page.data);
        if (page.data.length < 1000) break;
      }
      return data.map(post => ({
        ...post,
        stamp: post.published_at || post.scheduled_at!,
        day: dateKey(post.published_at || post.scheduled_at!, zone.data!),
        media: [...post.post_media].sort((a, b) => a.position - b.position)[0],
      })).sort((a, b) => Date.parse(a.stamp) - Date.parse(b.stamp));
    },
  });
  const posts = schedule.data ?? [];
  const daily = posts.filter(post => post.day === selected);
  const previews = useQuery({
    queryKey: ["home-schedule-previews", workspaceId, posts.map(post => post.media?.storage_path)],
    enabled: posts.some(post => !!post.media?.storage_path),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const paths = [...new Set(posts.flatMap(post => post.media?.storage_path ? [post.media.storage_path] : []))];
      const result = await supabase.storage.from("post-media").createSignedUrls(paths, 3600);
      if (result.error) throw result.error;
      return Object.fromEntries(result.data.filter(item => item.path && item.signedUrl).map(item => [item.path!, item.signedUrl]));
    },
  });

  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone.data || "UTC", hour: "2-digit", minute: "2-digit" });
  function navigate(next: string) {
    setCursor(next);
    setSelected(undefined);
  }

  return <section aria-label="Schedule calendar" className="overflow-hidden rounded-2xl border border-border bg-background">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label={`Previous ${view}`} onClick={() => navigate(shiftCursor(anchor, view, -1))}><ChevronLeft /></Button>
        <h2 className="font-display font-bold">{format(new Date(anchor + "T12:00:00"), "MMMM yyyy")}</h2>
        <Button size="icon" variant="ghost" aria-label={`Next ${view}`} onClick={() => navigate(shiftCursor(anchor, view, 1))}><ChevronRight /></Button>
        <Button size="sm" variant="outline" onClick={() => { navigate(today); setSelected(today); }}>Today</Button>
      </div>
      <div className="flex items-center gap-2"><a href="/app/schedule" className="text-sm font-semibold underline">Open full calendar</a><span className="text-xs text-muted-foreground">{zone.data}</span>
        <div className="rounded-lg bg-surface-subtle p-1">{(["week", "month"] as const).map(mode =>
          <Button key={mode} size="sm" variant={mode === view ? "secondary" : "ghost"} aria-pressed={mode === view}
            onClick={() => { navigate(selected ?? anchor); setView(mode); }} className="capitalize">{mode}</Button>)}</div>
      </div>
    </header>
    {zone.isError || schedule.isError ? <p role="alert" className="p-4">Couldn’t load the schedule.</p> :
      schedule.isPending ? <p role="status" className="p-4">Loading schedule…</p> : null}
    <div className="overflow-x-auto"><div className="min-w-[40rem]">
      <div className="grid grid-cols-7 bg-surface-subtle text-center text-xs text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label => <span key={label} className="py-2">{label}</span>)}
      </div>
      {days.filter((_, index) => index % 7 === 0).map((week, index) => {
        const dates = days.slice(index * 7, index * 7 + 7);
        return <Fragment key={week}><div className="grid grid-cols-7">
          {dates.map(key => {
            const entries = posts.filter(post => post.day === key);
            const date = new Date(key + "T12:00:00");
            return <button type="button" key={key} aria-label={format(date, "EEEE d MMMM yyyy") + (entries.length ? ", " + entries.length + (entries.length === 1 ? " post" : " posts") : "")}
              aria-pressed={selected === key} onClick={() => setSelected(key)}
              className={`flex min-h-20 min-w-0 flex-col items-stretch gap-1 border-r border-t border-border p-1.5 text-left last:border-r-0 hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === key ? "bg-muted" : ""}`}>
              <span className={`mx-auto grid size-7 place-items-center rounded-full text-xs font-semibold ${key === today ? "bg-primary text-primary-foreground" : key.slice(0, 7) !== anchor.slice(0, 7) ? "text-muted-foreground" : ""}`}>{date.getDate()}</span>
              {entries.map(post => {
                const url = post.media && previews.data?.[post.media.storage_path];
                return <span key={post.id} className="block rounded-lg border border-border bg-card p-1 shadow-sm">
                  {url && (post.media.kind === "video" ? <video src={url} muted preload="metadata" className="aspect-video w-full rounded object-cover" /> :
                    <img src={url} alt="" className="aspect-video w-full rounded object-cover" />)}
                  <span className="mt-1 flex flex-wrap justify-between gap-x-1 text-[10px] capitalize text-muted-foreground"><time>{time.format(new Date(post.stamp))}</time>{post.status}</span>
                  <span className="my-1 line-clamp-2 break-words text-xs">{post.caption}</span>
                  <span className="block truncate text-[10px] capitalize text-muted-foreground">{[...new Set(post.post_targets.map(target => target.platform))].join(" · ")}</span>
                </span>;
              })}
            </button>;
          })}
        </div>{selected && dates.includes(selected) && (
          <section aria-label="Day preview" className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-bold">{format(new Date(selected + "T12:00:00"), "EEEE d MMMM yyyy")}</h2>
            {zone.isError || schedule.isError ? <p role="alert">Couldn’t load the schedule.</p> :
              schedule.isPending ? <p role="status">Loading schedule…</p> :
              daily.length === 0 ? <p className="text-sm text-muted-foreground">No posts scheduled for this day.</p> :
              daily.map(post => {
                const url = post.media && previews.data?.[post.media.storage_path];
                return <article key={post.id} className="space-y-3 border-t border-border pt-4">
                  <time dateTime={post.stamp} className="font-semibold">{new Intl.DateTimeFormat("en-GB", {
                    timeZone: zone.data, hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                  }).format(new Date(post.stamp))}</time>
                  <p className="text-sm capitalize text-muted-foreground">{[...new Set(post.post_targets.map(target => target.platform))].join(" · ")}</p>
                  {url && (post.media.kind === "video" ? <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-lg" /> :
                    <img src={url} alt="Scheduled post artwork" className="max-h-64 max-w-full rounded-lg object-contain" />)}
                  <p className="whitespace-pre-wrap break-words text-sm">{post.caption}</p><a href={`/app/schedule?post=${encodeURIComponent(post.id)}`} className="inline-block text-sm font-semibold underline">Open in Publish</a>
                </article>;
              })}
          </section>
        )}</Fragment>;
      })}
    </div></div>
  </section>;
}

