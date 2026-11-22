import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export type DateRange = "7d" | "28d" | "90d";

export function getDateRange(range: DateRange) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (range === "7d" ? 7 : range === "28d" ? 28 : 90));
  return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
}

/** Calls an admin analytics edge function with a fresh session token. */
export async function callAdminFn(fn: string, body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session || (session.expires_at ?? 0) * 1000 < Date.now() + 30_000) {
    session = (await supabase.auth.refreshSession()).data.session;
  }
  if (!session) throw new Error("Your session has ended. Please sign in again.");
  const res = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.error) {
    const status = (res.error as { context?: Response }).context?.status;
    if (status === 401) {
      throw new Error("Only super admins can view this. If you've switched into another account, return to your own account and try again.");
    }
    throw new Error(res.error.message);
  }
  return res.data;
}

export function openAuthPopup(url: string, name: string) {
  const w = window.open(url, name, "width=600,height=700");
  if (!w) window.open(url, "_blank");
}

/** Tokens used by recharts (CSS vars resolve in SVG). */
export const CHART = {
  ink: "hsl(var(--foreground))",
  muted: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--border))",
  series: ["hsl(var(--foreground))", "hsl(var(--muted-foreground))", "hsl(var(--border))", "hsl(var(--muted))"],
};

export const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

export function PageHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function ConnectionStrip({
  connected, label, value, updatedAt, onConnect,
}: {
  connected: boolean;
  label: string;
  value?: string | null | undefined;
  updatedAt?: string | null | undefined;
  onConnect?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/30" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? "bg-foreground" : "bg-muted-foreground/40"}`} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{connected ? "Connected" : "Not connected"}</p>
          <p className="text-xs text-muted-foreground">
            {label}{" "}
            <span className="font-mono text-foreground">{value || "not set"}</span>
            {connected && updatedAt && <> · synced {new Date(updatedAt).toLocaleString()}</>}
          </p>
        </div>
      </div>
      {onConnect && (
        connected ? (
          <button onClick={onConnect} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Reconnect
          </button>
        ) : (
          <button onClick={onConnect} className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90">
            Connect
          </button>
        )
      )}
    </div>
  );
}

export function RangeSelect({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className="h-9 w-36 rounded-full border-border bg-card text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7d">Last 7 days</SelectItem>
        <SelectItem value="28d">Last 28 days</SelectItem>
        <SelectItem value="90d">Last 90 days</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function LivePill({ count }: { count: number }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs text-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
      {count} active now
    </span>
  );
}

export function StatRow({ stats, loading }: { stats: { label: string; value: string }[]; loading?: boolean }) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-card" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((s, i) => (
        <div key={s.label} className={`px-5 py-5 ${i > 0 ? "border-l border-border" : ""}`}>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-20" /> : (
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{s.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function DataTable({ columns, rows, empty = "No data for this period" }: {
  columns: string[];
  rows: (string | number | undefined)[][];
  empty?: string;
}) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          {columns.map((c, i) => (
            <th key={c} className={`pb-2 text-[11px] font-medium text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-border/60 last:border-0">
            {r.map((cell, i) => (
              <td key={i} className={`py-2.5 ${i === 0 ? "max-w-[240px] truncate text-left text-foreground" : "text-right tabular-nums text-muted-foreground"}`} title={i === 0 ? String(cell) : undefined}>
                {cell ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-sm">
      <p className="font-medium text-foreground">Couldn't load this page</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      <button onClick={onRetry} className="mt-4 rounded-full border border-border px-4 py-1.5 text-xs hover:bg-muted">Try again</button>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  );
}

/** Monochrome donut + legend list, on-brand replacement for pie charts. */
export function BrandDonut({ data, empty = "No data yet" }: { data: { name: string; value: number }[]; empty?: string }) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  const top = rows.slice(0, 5);
  const rest = rows.slice(5).reduce((s, d) => s + d.value, 0);
  const list = rest ? [...top, { name: "Other", value: rest }] : top;
  const shades = [1, 0.7, 0.5, 0.35, 0.22, 0.12];
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="12" />
          {list.map((d, i) => {
            const len = (d.value / total) * C;
            const el = <circle key={d.name} cx="64" cy="64" r={R} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={shades[i]} strokeWidth="12" strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {list.map((d, i) => {
          const pct = Math.round((d.value / total) * 100);
          return (
            <li key={d.name} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" style={{ opacity: shades[i] }} />
                <span className="truncate text-foreground" title={d.name}>{d.name}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{pct}% · {d.value.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%`, opacity: shades[i] }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
