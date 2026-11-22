import type { ChartBlock as ChartBlockT } from "../types";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const PALETTE = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--ring))"];

export function ChartBlockView({ block }: { block: ChartBlockT }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      {block.title && <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{block.title}</div>}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(block)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderChart(block: ChartBlockT): React.ReactElement {
  const common = { data: block.data };
  if (block.chart === "pie") {
    const key = block.series[0] ?? "";
    return (
      <PieChart>
        <Tooltip />
        <Pie data={block.data} dataKey={key} nameKey={block.xKey} outerRadius={80} label>
          {block.data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
      </PieChart>
    );
  }
  const Chart = block.chart === "bar" ? BarChart : block.chart === "area" ? AreaChart : LineChart;
  return (
    <Chart {...common}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey={block.xKey} stroke="hsl(var(--muted-foreground))" fontSize={11} />
      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {block.series.map((s, i) => {
        const color = PALETTE[i % PALETTE.length];
        if (block.chart === "bar") return <Bar key={s} dataKey={s} fill={color} radius={[4, 4, 0, 0]} />;
        if (block.chart === "area") return <Area key={s} type="monotone" dataKey={s} stroke={color} fill={color} fillOpacity={0.2} />;
        return <Line key={s} type="monotone" dataKey={s} stroke={color} strokeWidth={2} dot={false} />;
      })}
    </Chart>
  );
}