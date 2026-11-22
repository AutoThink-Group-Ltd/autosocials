import type { StatBlock as StatBlockT } from "../types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function StatBlockView({ block }: { block: StatBlockT }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {block.stats.map((s, i) => {
        const Trend = s.trend === "up" ? TrendingUp : s.trend === "down" ? TrendingDown : Minus;
        const trendColor = s.trend === "up" ? "text-emerald-600" : s.trend === "down" ? "text-destructive" : "text-muted-foreground";
        return (
          <div key={i} className="rounded-lg border border-border bg-card/50 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
            <div className="text-lg font-semibold text-foreground mt-0.5">{s.value}</div>
            {s.delta && (
              <div className={`text-xs mt-1 inline-flex items-center gap-1 ${trendColor}`}>
                <Trend className="w-3 h-3" />{s.delta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}