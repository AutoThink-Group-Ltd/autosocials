import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Eye, Users, Clock, ArrowDown, MousePointerClick, AlertTriangle,
  TrendingUp, ArrowLeft, BarChart3, Globe, Monitor, Smartphone, Loader2
} from "lucide-react";
import { BrandDonut } from "./analytics-ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type DateRange = "24h" | "7d" | "30d" | "custom";

function getDateFilter(range: DateRange, customFrom?: string, customTo?: string): string {
  const now = new Date();
  // Use UK time
  if (range === "custom" && customFrom) return new Date(customFrom).toISOString();
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

const COLORS = [
  "hsl(330, 80%, 52%)", "hsl(270, 40%, 50%)", "hsl(200, 70%, 50%)",
  "hsl(150, 60%, 40%)", "hsl(40, 80%, 50%)", "hsl(0, 70%, 50%)",
  "hsl(180, 50%, 45%)", "hsl(300, 40%, 55%)"
];

export default function WebAnalyticsTab() {
  const [range, setRange] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [drilldownPath, setDrilldownPath] = useState<string | null>(null);

  const dateFrom = getDateFilter(range, customFrom);
  const dateTo = range === "custom" && customTo ? new Date(customTo).toISOString() : new Date().toISOString();

  const { data: pageViews = [], isLoading } = useQuery({
    queryKey: ["admin-analytics-pv", range, customFrom, customTo],
    queryFn: async () => {
      return fetchAll<any>((a, b) => supabase
        .from("website_page_views" as any)
        .select("*")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo)
        .order("created_at", { ascending: false })
        .range(a, b) as any);
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["admin-analytics-events", range, customFrom, customTo],
    queryFn: async () => {
      return fetchAll<any>((a, b) => supabase
        .from("website_engagement_events" as any)
        .select("*")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo)
        .order("created_at", { ascending: false })
        .range(a, b) as any);
    },
  });

  // Overview stats
  const stats = useMemo(() => {
    const views = drilldownPath ? pageViews.filter((pv: any) => pv.page_path === drilldownPath) : pageViews;
    const total = views.length;
    const uniqueVisitors = new Set(views.map((pv: any) => pv.anonymous_id)).size;
    const avgTime = total ? Math.round(views.reduce((s: number, pv: any) => s + (pv.time_on_page_seconds || 0), 0) / total) : 0;
    const avgScroll = total ? Math.round(views.reduce((s: number, pv: any) => s + (pv.scroll_depth_max || 0), 0) / total) : 0;
    const avgEngagement = total ? Math.round(views.reduce((s: number, pv: any) => s + (pv.engagement_score || 0), 0) / total) : 0;
    const bounces = views.filter((pv: any) => pv.is_bounce).length;
    const bounceRate = total ? Math.round((bounces / total) * 100) : 0;
    const ctaClicks = views.filter((pv: any) => pv.cta_clicked).length;
    const ctaRate = total ? Math.round((ctaClicks / total) * 100) : 0;
    const rageClicks = views.reduce((s: number, pv: any) => s + (pv.rage_clicks || 0), 0);
    const deadClicks = views.reduce((s: number, pv: any) => s + (pv.dead_clicks || 0), 0);
    return { total, uniqueVisitors, avgTime, avgScroll, avgEngagement, bounceRate, ctaRate, ctaClicks, rageClicks, deadClicks };
  }, [pageViews, drilldownPath]);

  // Page performance table
  const pagePerformance = useMemo(() => {
    const map: Record<string, any[]> = {};
    pageViews.forEach((pv: any) => {
      const key = pv.page_path;
      if (!map[key]) map[key] = [];
      map[key]!.push(pv);
    });
    return Object.entries(map)
      .map(([path, views]) => {
        const total = views.length;
        const unique = new Set(views.map((v) => v.anonymous_id)).size;
        const avgTime = Math.round(views.reduce((s, v) => s + (v.time_on_page_seconds || 0), 0) / total);
        const avgScroll = Math.round(views.reduce((s, v) => s + (v.scroll_depth_max || 0), 0) / total);
        const avgEngagement = Math.round(views.reduce((s, v) => s + (v.engagement_score || 0), 0) / total);
        const bounceRate = Math.round((views.filter((v) => v.is_bounce).length / total) * 100);
        const ctaClicks = views.filter((v) => v.cta_clicked).length;
        return { path, total, unique, avgTime, avgScroll, avgEngagement, bounceRate, ctaClicks };
      })
      .sort((a, b) => b.total - a.total);
  }, [pageViews]);

  // Drilldown data
  const drilldownViews = useMemo(() =>
    drilldownPath ? pageViews.filter((pv: any) => pv.page_path === drilldownPath) : [],
    [pageViews, drilldownPath]
  );

  const scrollFunnel = useMemo(() => {
    if (!drilldownViews.length) return [];
    const t = drilldownViews.length;
    return [
      { name: "25%", value: Math.round((drilldownViews.filter((v: any) => v.scroll_depth_25).length / t) * 100) },
      { name: "50%", value: Math.round((drilldownViews.filter((v: any) => v.scroll_depth_50).length / t) * 100) },
      { name: "75%", value: Math.round((drilldownViews.filter((v: any) => v.scroll_depth_75).length / t) * 100) },
      { name: "100%", value: Math.round((drilldownViews.filter((v: any) => v.scroll_depth_100).length / t) * 100) },
    ];
  }, [drilldownViews]);

  const timeDistribution = useMemo(() => {
    if (!drilldownViews.length) return [];
    const buckets = [
      { name: "0-5s", min: 0, max: 5 },
      { name: "5-15s", min: 5, max: 15 },
      { name: "15-30s", min: 15, max: 30 },
      { name: "30-60s", min: 30, max: 60 },
      { name: "60s+", min: 60, max: Infinity },
    ];
    return buckets.map((b) => ({
      name: b.name,
      value: drilldownViews.filter((v: any) => v.time_on_page_seconds >= b.min && v.time_on_page_seconds < b.max).length,
    }));
  }, [drilldownViews]);

  const referrerBreakdown = useMemo(() => {
    const views = drilldownPath ? drilldownViews : pageViews;
    const map: Record<string, number> = {};
    views.forEach((v: any) => {
      const ref = v.referrer ? (() => { try { return new URL(v.referrer).hostname; } catch { return v.referrer; } })() : "Direct";
      map[ref] = (map[ref] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [pageViews, drilldownViews, drilldownPath]);

  const deviceBreakdown = useMemo(() => {
    const views = drilldownPath ? drilldownViews : pageViews;
    let mobile = 0, desktop = 0, tablet = 0;
    views.forEach((v: any) => {
      const w = v.screen_width || 0;
      if (w < 768) mobile++;
      else if (w < 1024) tablet++;
      else desktop++;
    });
    return [
      { name: "Desktop", value: desktop },
      { name: "Mobile", value: mobile },
      { name: "Tablet", value: tablet },
    ].filter((d) => d.value > 0);
  }, [pageViews, drilldownViews, drilldownPath]);

  // UTM breakdown
  const utmBreakdown = useMemo(() => {
    const map: Record<string, { source: string; medium: string; campaign: string; count: number }> = {};
    pageViews.forEach((pv: any) => {
      if (!pv.utm_source && !pv.utm_medium && !pv.utm_campaign) return;
      const key = `${pv.utm_source || ""}|${pv.utm_medium || ""}|${pv.utm_campaign || ""}`;
      if (!map[key]) map[key] = { source: pv.utm_source || "-", medium: pv.utm_medium || "-", campaign: pv.utm_campaign || "-", count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [pageViews]);

  const drilldownEvents = useMemo(() =>
    drilldownPath ? events.filter((e: any) => e.page_path === drilldownPath) : [],
    [events, drilldownPath]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </>
        )}
        {drilldownPath && (
          <Button variant="outline" size="sm" onClick={() => setDrilldownPath(null)} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to overview
          </Button>
        )}
        {drilldownPath && (
          <Badge variant="secondary" className="text-sm">{drilldownPath}</Badge>
        )}
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreCard icon={Eye} label="Page Views" value={stats.total} />
        <ScoreCard icon={Users} label="Unique Visitors" value={stats.uniqueVisitors} />
        <ScoreCard icon={Clock} label="Avg Time (s)" value={stats.avgTime} />
        <ScoreCard icon={ArrowDown} label="Avg Scroll %" value={stats.avgScroll} />
        <ScoreCard icon={TrendingUp} label="Avg Engagement" value={stats.avgEngagement} suffix="/100" />
        <ScoreCard icon={AlertTriangle} label="Bounce Rate" value={stats.bounceRate} suffix="%" />
        <ScoreCard icon={MousePointerClick} label="CTA Click Rate" value={stats.ctaRate} suffix="%" />
        <ScoreCard icon={AlertTriangle} label="Rage Clicks" value={stats.rageClicks} />
      </div>

      {/* Drilldown view */}
      {drilldownPath ? (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Scroll Depth Funnel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scroll Depth Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={scrollFunnel}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="value" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Time Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Time on Page Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={timeDistribution}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Referrer Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Referrer Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {referrerBreakdown.length > 0 ? (
                  <BrandDonut data={referrerBreakdown} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No referrer data</p>
                )}
              </CardContent>
            </Card>

            {/* Device Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Device Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {deviceBreakdown.length > 0 ? (
                  <BrandDonut data={deviceBreakdown} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No device data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Engagement Events */}
          {drilldownEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Engagement Events</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drilldownEvents.slice(0, 50).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell><Badge variant="secondary">{e.event_type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.event_data ? JSON.stringify(e.event_data) : "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
          {/* Page Performance Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Page Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Unique</TableHead>
                    <TableHead className="text-right">Avg Time</TableHead>
                    <TableHead className="text-right">Avg Scroll</TableHead>
                    <TableHead className="text-right">Engagement</TableHead>
                    <TableHead className="text-right">Bounce</TableHead>
                    <TableHead className="text-right">CTA Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagePerformance.map((p) => (
                    <TableRow
                      key={p.path}
                      className="cursor-pointer"
                      onClick={() => setDrilldownPath(p.path)}
                    >
                      <TableCell className="font-medium text-sm">{p.path}</TableCell>
                      <TableCell className="text-right">{p.total}</TableCell>
                      <TableCell className="text-right">{p.unique}</TableCell>
                      <TableCell className="text-right">{p.avgTime}s</TableCell>
                      <TableCell className="text-right">{p.avgScroll}%</TableCell>
                      <TableCell className="text-right">{p.avgEngagement}</TableCell>
                      <TableCell className="text-right">{p.bounceRate}%</TableCell>
                      <TableCell className="text-right">{p.ctaClicks}</TableCell>
                    </TableRow>
                  ))}
                  {!pagePerformance.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No data for this period</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Referrer + Device side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Referrer Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {referrerBreakdown.length > 0 ? (
                  <BrandDonut data={referrerBreakdown} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No referrer data yet</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> Device Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deviceBreakdown.length > 0 ? (
                  <BrandDonut data={deviceBreakdown} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No device data yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* UTM Breakdown */}
          {utmBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">UTM Traffic Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Medium</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {utmBreakdown.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell>{u.source}</TableCell>
                        <TableCell>{u.medium}</TableCell>
                        <TableCell>{u.campaign}</TableCell>
                        <TableCell className="text-right">{u.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ScoreCard({ icon: Icon, label, value, suffix = "" }: { icon: any; label: string; value: number; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value.toLocaleString()}{suffix}</p>
        </div>
      </CardContent>
    </Card>
  );
}
