import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { type DateRange, CHART, tooltipStyle, PageHeader, RangeSelect, StatRow, Panel, DataTable, ErrorPanel, LoadingPage, BrandDonut } from "./analytics-ui";

type Stats = {
  total_users: number; signups: number; signups_prev: number; workspaces: number; active_subs: number;
  visitors: number; visitors_prev: number; pageviews: number; posts_created: number; posts_published: number;
  searches: number; emails: number; sam_threads: number;
  daily: { date: string; signups: number; visitors: number; pageviews: number }[];
  top_pages: { name: string; value: number }[]; top_sources: { name: string; value: number }[];
};

const DAYS: Record<DateRange, number> = { "7d": 7, "28d": 28, "90d": 90 };
const n = (x: number) => (x ?? 0).toLocaleString();
const delta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);

export default function OverviewTab() {
  const [range, setRange] = useState<DateRange>("28d");
  const q = useQuery({
    queryKey: ["admin-overview", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview_stats" as never, { _days: DAYS[range] } as never);
      if (error) throw new Error(error.message);
      return data as unknown as Stats;
    },
  });
  if (q.error) return <ErrorPanel message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <LoadingPage />;
  const s = q.data;
  const sd = delta(s.signups, s.signups_prev), vd = delta(s.visitors, s.visitors_prev);
  const sign = (d: number) => `${d >= 0 ? "+" : ""}${d}%`;
  const topSource = s.top_sources[0];
  const insights = [
    `Signups ${sd >= 0 ? "up" : "down"} ${Math.abs(sd)}% on the previous ${DAYS[range]} days (${n(s.signups)} vs ${n(s.signups_prev)}).`,
    `Visitors ${vd >= 0 ? "up" : "down"} ${Math.abs(vd)}%${topSource ? ` — most sessions come from ${topSource.name}` : ""}.`,
    s.visitors ? `${((s.signups / s.visitors) * 100).toFixed(1)}% of visitors signed up; ${n(s.posts_published)} posts went live.` : `No site visits tracked yet; ${n(s.posts_published)} posts went live.`,
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Super admin" title="Overview" right={<RangeSelect value={range} onChange={setRange} />} />

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Sam's read</p>
        <ul className="mt-3 space-y-1.5 text-sm text-foreground">
          {insights.map((t) => <li key={t} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground" />{t}</li>)}
        </ul>
      </section>

      <StatRow stats={[
        { label: "Total users", value: n(s.total_users) },
        { label: `Signups · ${sign(sd)}`, value: n(s.signups) },
        { label: "Workspaces", value: n(s.workspaces) },
        { label: "Active subs", value: n(s.active_subs) },
        { label: `Visitors · ${sign(vd)}`, value: n(s.visitors) },
      ]} />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Signups">
          <Trend data={s.daily} k="signups" />
        </Panel>
        <Panel title="Visitors">
          <Trend data={s.daily} k="visitors" />
        </Panel>
      </div>

      <StatRow stats={[
        { label: "Page views", value: n(s.pageviews) },
        { label: "Posts created", value: n(s.posts_created) },
        { label: "Posts published", value: n(s.posts_published) },
        { label: "Creator searches", value: n(s.searches) },
        { label: "Emails sent", value: n(s.emails) },
        { label: "Sam chats", value: n(s.sam_threads) },
      ]} />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Top pages"><DataTable columns={["Page", "Views"]} rows={s.top_pages.map((r) => [r.name, n(r.value)])} /></Panel>
        <Panel title="Traffic sources"><BrandDonut data={s.top_sources} empty="No traffic yet" /></Panel>
      </div>
    </div>
  );
}

function Trend({ data, k }: { data: Stats["daily"]; k: "signups" | "visitors" }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.ink} stopOpacity={0.18} />
            <stop offset="100%" stopColor={CHART.ink} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey={k} stroke={CHART.ink} strokeWidth={2} fill={`url(#g-${k})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
