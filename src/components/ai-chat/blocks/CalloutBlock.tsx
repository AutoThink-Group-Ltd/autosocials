import type { CalloutBlock as CalloutBlockT } from "../types";
import { Info, CheckCircle2, AlertTriangle, OctagonAlert } from "lucide-react";

const meta = {
  info: { Icon: Info, cls: "border-border bg-muted/40 text-foreground" },
  success: { Icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5 text-foreground" },
  warning: { Icon: AlertTriangle, cls: "border-amber-500/40 bg-amber-500/5 text-foreground" },
  danger: { Icon: OctagonAlert, cls: "border-destructive/40 bg-destructive/5 text-foreground" },
} as const;

export function CalloutBlockView({ block }: { block: CalloutBlockT }) {
  const m = meta[block.intent];
  const Icon = m.Icon;
  return (
    <div className={`rounded-lg border p-3 flex gap-2.5 ${m.cls}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 text-sm">
        {block.title && <div className="font-semibold mb-0.5">{block.title}</div>}
        <div className="text-foreground/90">{block.body}</div>
      </div>
    </div>
  );
}