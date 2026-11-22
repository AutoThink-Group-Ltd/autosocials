import type { TableBlock as TableBlockT } from "../types";

export function TableBlockView({ block }: { block: TableBlockT }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      {block.title && <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">{block.title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>{block.columns.map((c) => <th key={c.key} className="text-left font-medium px-3 py-2">{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {block.rows.map((row, i) => (
              <tr key={i}>{block.columns.map((c) => <td key={c.key} className="px-3 py-2 text-foreground">{row[c.key] ?? ""}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}