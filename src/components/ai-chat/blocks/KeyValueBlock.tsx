import { Fragment } from "react";
import type { KeyValueBlock as KeyValueBlockT } from "../types";

export function KeyValueBlockView({ block }: { block: KeyValueBlockT }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      {block.title && <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{block.title}</div>}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {block.pairs.map((p, i) => (
          <Fragment key={i}>
            <dt className="text-muted-foreground">{p.label}</dt>
            <dd className="text-foreground font-medium">{p.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}