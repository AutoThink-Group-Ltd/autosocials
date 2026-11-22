import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  type DateRange, getDateRange, callAdminFn, openAuthPopup, CHART, tooltipStyle,
  PageHeader, ConnectionStrip, RangeSelect, StatRow, Panel, DataTable, ErrorPanel, LoadingPage,
} from "./analytics-ui";
import { GscDigestPanel } from "./GscDigestPanel";

const callGSC = (action: string, startDate?: string, endDate?: string) =>
  callAdminFn("google-search-console", { action, startDate, endDate });

export default function SearchConsoleTab() {
  const [range, setRange] = useState<DateRange>("28d");
  const queryClient = useQueryClient();
  const { startDate, endDate } = getDateRange(range);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "GOOGLE_AUTH_SUCCESS" && e.data?.service === "search_console") {
        queryClient.invalidateQueries({ queryKey: ["gsc-connection"] });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  const conn = useQuery({ queryKey: ["gsc-connection"], queryFn: () => callGSC("check_connection"), retry: false });
  const connected = !!conn.data?.connected;
  const q = (key: string) => ({
    queryKey: ["gsc-" + key, range],
    queryFn: () => callGSC(key, startDate, endDate),
    enabled: connected,
  });
  const overview = useQuery(q("overview"));
  const queries = useQuery(q("queries"));
  const pages = useQuery(q("pages"));
  const countries = useQuery(q("countries"));
  const devices = useQuery(q("devices"));

  const daily = useMemo(() => (overview.data?.rows ?? []).map((r: any) => ({
    date: r.keys[0]?.slice(5),
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    position: r.position || 0,
  })), [overview.data]);

  const totals = useMemo(() => {
    const clicks = daily.reduce((s: number, d: any) => s + d.clicks, 0);
    const impressions = daily.reduce((s: number, d: any) => s + d.impressions, 0);
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const position = daily.length ? daily.reduce((s: number, d: any) => s + d.position, 0) / daily.length : 0;
    return { clicks, impressions, ctr, position };
  }, [daily]);

  if (conn.error) return <ErrorPanel message={(conn.error as Error).message} onRetry={() => conn.refetch()} />;
  if (conn.isLoading) return <LoadingPage />;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Search Console" right={connected ? <RangeSelect value={range} onChange={setRange} /> : null} />

      <ConnectionStrip
        connected={connected}
        label="Site"
        value={conn.data?.siteUrl}
        updatedAt={conn.data?.service?.updated_at}
        onConnect={conn.data?.authUrl ? () => openAuthPopup(conn.data.authUrl, "gsc-auth") : undefined}
      />

      {connected && (
        <>
          <GscDigestPanel />
          <StatRow
            loading={overview.isLoading}
            stats={[
              { label: "Clicks", value: totals.clicks.toLocaleString() },
              { label: "Impressions", value: totals.impressions.toLocaleString() },
              { label: "CTR", value: `${totals.ctr.toFixed(1)}%` },
              { label: "Avg position", value: totals.position.toFixed(1) },
            ]}
          />

          <Panel title="Clicks and impressions">
            {daily.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={daily}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: CHART.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line yAxisId="l" type="monotone" dataKey="clicks" stroke={CHART.ink} strokeWidth={2} dot={false} />
                  <Line yAxisId="r" type="monotone" dataKey="impressions" stroke={CHART.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="py-10 text-center text-sm text-muted-foreground">No data for this period</p>}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Top queries">
              <DataTable columns={["Query", "Clicks", "Impr.", "CTR", "Pos."]}
                rows={(queries.data?.rows ?? []).slice(0, 15).map((r: any) => [r.keys[0], r.clicks, r.impressions, pct(r.ctr), r.position.toFixed(1)])} />
            </Panel>
            <Panel title="Top pages">
              <DataTable columns={["Page", "Clicks", "Impr.", "CTR"]}
                rows={(pages.data?.rows ?? []).slice(0, 10).map((r: any) => [r.keys[0], r.clicks, r.impressions, pct(r.ctr)])} />
            </Panel>
            <Panel title="Countries">
              <DataTable columns={["Country", "Clicks", "Impressions"]}
                rows={(countries.data?.rows ?? []).slice(0, 10).map((r: any) => [r.keys[0], r.clicks, r.impressions])} />
            </Panel>
            <Panel title="Devices">
              <DataTable columns={["Device", "Clicks", "Impressions"]}
                rows={(devices.data?.rows ?? []).map((r: any) => [r.keys[0], r.clicks, r.impressions])} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
