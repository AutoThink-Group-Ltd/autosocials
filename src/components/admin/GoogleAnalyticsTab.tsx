import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  type DateRange, getDateRange, callAdminFn, openAuthPopup, CHART, tooltipStyle,
  PageHeader, ConnectionStrip, RangeSelect, LivePill, StatRow, Panel, DataTable, ErrorPanel, LoadingPage,
} from "./analytics-ui";

const callGA4 = (action: string, startDate?: string, endDate?: string) =>
  callAdminFn("google-analytics-data", { action, startDate, endDate });

function rowsOf(data: any): { d: string[]; m: number[] }[] {
  return (data?.rows ?? []).map((row: any) => ({
    d: row.dimensionValues?.map((x: any) => x.value) ?? [],
    m: row.metricValues?.map((x: any) => parseFloat(x.value)) ?? [],
  }));
}

export default function GoogleAnalyticsTab() {
  const [range, setRange] = useState<DateRange>("28d");
  const queryClient = useQueryClient();
  const { startDate, endDate } = getDateRange(range);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "GOOGLE_AUTH_SUCCESS" && e.data?.service === "analytics") {
        queryClient.invalidateQueries({ queryKey: ["ga4-connection"] });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  const conn = useQuery({ queryKey: ["ga4-connection"], queryFn: () => callGA4("check_connection"), retry: false });
  const connected = !!conn.data?.connected;
  const q = (key: string) => ({
    queryKey: ["ga4-" + key, range],
    queryFn: () => callGA4(key, startDate, endDate),
    enabled: connected,
  });
  const overview = useQuery(q("overview"));
  const topPages = useQuery(q("top_pages"));
  const sources = useQuery(q("traffic_sources"));
  const countries = useQuery(q("countries"));
  const devices = useQuery(q("devices"));
  const realtime = useQuery({ queryKey: ["ga4-realtime"], queryFn: () => callGA4("realtime"), enabled: connected, refetchInterval: 30000 });

  const daily = useMemo(() => rowsOf(overview.data).map((r) => ({
    date: r.d[0]?.replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2"),
    sessions: r.m[0] || 0,
    users: r.m[1] || 0,
    pageviews: r.m[2] || 0,
    bounce: (r.m[3] || 0) * 100,
    duration: r.m[4] || 0,
  })), [overview.data]);

  const totals = useMemo(() => {
    const sum = (k: "sessions" | "users" | "pageviews") => daily.reduce((s, d) => s + d[k], 0);
    const avg = (k: "bounce" | "duration") => (daily.length ? daily.reduce((s, d) => s + d[k], 0) / daily.length : 0);
    return { sessions: sum("sessions"), users: sum("users"), pageviews: sum("pageviews"), bounce: avg("bounce"), duration: avg("duration") };
  }, [daily]);

  if (conn.error) return <ErrorPanel message={(conn.error as Error).message} onRetry={() => conn.refetch()} />;
  if (conn.isLoading) return <LoadingPage />;

  const n = (x: number | undefined) => Math.round(x ?? 0).toLocaleString();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Google Analytics"
        right={connected ? (
          <div className="flex items-center gap-2">
            {realtime.data && <LivePill count={realtime.data.activeUsers ?? 0} />}
            <RangeSelect value={range} onChange={setRange} />
          </div>
        ) : null}
      />

      <ConnectionStrip
        connected={connected}
        label="GA4 property"
        value={conn.data?.propertyId}
        updatedAt={conn.data?.service?.updated_at}
        onConnect={conn.data?.authUrl ? () => openAuthPopup(conn.data.authUrl, "ga4-auth") : undefined}
      />

      {connected && (
        <>
          <StatRow
            loading={overview.isLoading}
            stats={[
              { label: "Sessions", value: n(totals.sessions) },
              { label: "Users", value: n(totals.users) },
              { label: "Page views", value: n(totals.pageviews) },
              { label: "Bounce rate", value: `${Math.round(totals.bounce)}%` },
              { label: "Avg time", value: `${Math.round(totals.duration)}s` },
            ]}
          />

          <Panel title="Sessions and users">
            {daily.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={daily}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="sessions" stroke={CHART.ink} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="users" stroke={CHART.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="py-10 text-center text-sm text-muted-foreground">No data for this period</p>}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Top pages">
              <DataTable columns={["Page", "Views", "Users"]}
                rows={rowsOf(topPages.data).slice(0, 10).map((r) => [r.d[0], n(r.m[0]), n(r.m[2])])} />
            </Panel>
            <Panel title="Traffic sources">
              <DataTable columns={["Source / medium", "Sessions", "Users"]}
                rows={rowsOf(sources.data).slice(0, 10).map((r) => [r.d[0], n(r.m[0]), n(r.m[1])])} />
            </Panel>
            <Panel title="Countries">
              <DataTable columns={["Country", "Sessions", "Users"]}
                rows={rowsOf(countries.data).slice(0, 10).map((r) => [r.d[0], n(r.m[0]), n(r.m[1])])} />
            </Panel>
            <Panel title="Devices">
              <DataTable columns={["Device", "Sessions", "Users"]}
                rows={rowsOf(devices.data).map((r) => [r.d[0], n(r.m[0]), n(r.m[1])])} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
