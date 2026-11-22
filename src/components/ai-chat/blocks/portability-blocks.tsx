import { useState } from "react";
import type {
  ComparisonStripBlock,
  DrillDownBlock,
  DocumentPreviewBlock,
  FilePreviewBlock,
  ReportPreviewBlock,
  ChecklistBlock,
  StatusPanelBlock,
  WorkflowStepsBlock,
  ActionButton,
} from "../types";
import type { ActionHandler } from "./ActionsBlock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  File as FileIcon,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";

function ActionBtn({ a, onAction }: { a: ActionButton; onAction?: ActionHandler | undefined }) {
  return (
    <Button
      size="sm"
      variant={a.variant === "destructive" ? "destructive" : a.variant === "ghost" ? "ghost" : a.variant === "secondary" ? "secondary" : "default"}
      onClick={() => onAction?.(a)}
    >
      {a.label}
    </Button>
  );
}

// ── comparison_strip ────────────────────────────────────────────
export function ComparisonStripBlockView({
  block,
  onAction,
}: {
  block: ComparisonStripBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {block.title && <p className="text-xs font-medium text-foreground">{block.title}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {block.entities.map((e, i) => {
          const TrendIcon = e.trend === "up" ? TrendingUp : e.trend === "down" ? TrendingDown : Minus;
          return (
            <div
              key={i}
              className={`rounded-md border p-2 space-y-1.5 text-xs ${
                e.recommended ? "border-primary/60 bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground truncate">{e.name}</p>
                {e.recommended && <Star className="w-3 h-3 text-primary fill-primary" />}
              </div>
              {e.keyMetric && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendIcon className="w-3 h-3" />
                  <span>{e.keyMetric}</span>
                </div>
              )}
              {e.strengths && e.strengths.length > 0 && (
                <ul className="text-muted-foreground space-y-0.5">
                  {e.strengths.map((s, j) => (
                    <li key={j}>+ {s}</li>
                  ))}
                </ul>
              )}
              {e.weaknesses && e.weaknesses.length > 0 && (
                <ul className="text-muted-foreground space-y-0.5 opacity-80">
                  {e.weaknesses.map((s, j) => (
                    <li key={j}>− {s}</li>
                  ))}
                </ul>
              )}
              {e.action && <ActionBtn a={e.action} onAction={onAction} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── drill_down ──────────────────────────────────────────────────
export function DrillDownBlockView({ block }: { block: DrillDownBlock }) {
  const [open, setOpen] = useState<number>(0);
  return (
    <div className="rounded-lg border border-border bg-card p-2 space-y-1">
      {block.title && (
        <p className="text-xs font-medium text-foreground px-1 py-1">{block.title}</p>
      )}
      {block.layers.map((layer, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="rounded border border-border/50">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted/30"
            >
              <span className="capitalize">{layer.label}</span>
              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {isOpen && (
              <div className="px-2 py-2 text-xs text-muted-foreground whitespace-pre-wrap border-t border-border/50">
                {layer.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── document_preview ────────────────────────────────────────────
export function DocumentPreviewBlockView({
  block,
  onAction,
}: {
  block: DocumentPreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{block.title}</p>
          {block.subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">{block.subtitle}</p>
          )}
        </div>
      </div>
      <div className="px-3 py-3 text-xs text-foreground whitespace-pre-wrap max-h-72 overflow-y-auto">
        {block.body}
      </div>
      {block.actions && block.actions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/10">
          {block.actions.map((a, i) => (
            <ActionBtn key={i} a={a} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── file_preview ────────────────────────────────────────────────
function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FilePreviewBlockView({
  block,
  onAction,
}: {
  block: FilePreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded bg-muted/30 flex items-center justify-center flex-shrink-0">
        <FileIcon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{block.filename}</p>
        <p className="text-[11px] text-muted-foreground">
          {[block.mimeType, formatBytes(block.sizeBytes)].filter(Boolean).join(" · ")}
        </p>
        {block.caption && (
          <p className="text-xs text-muted-foreground mt-1">{block.caption}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {block.url && (
          <Button asChild size="sm" variant="ghost">
            <a href={block.url} target="_blank" rel="noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        )}
        {block.actions?.map((a, i) => <ActionBtn key={i} a={a} onAction={onAction} />)}
      </div>
    </div>
  );
}

// ── report_preview ──────────────────────────────────────────────
export function ReportPreviewBlockView({
  block,
  onAction,
}: {
  block: ReportPreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{block.title}</p>
        {block.period && <p className="text-[11px] text-muted-foreground">{block.period}</p>}
      </div>
      {block.metrics && block.metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {block.metrics.map((m, i) => (
            <div key={i} className="rounded-md bg-muted/20 p-2">
              <p className="text-[10px] uppercase text-muted-foreground">{m.label}</p>
              <p className="text-sm font-medium text-foreground">{m.value}</p>
            </div>
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] uppercase text-muted-foreground mb-1">Highlights</p>
        <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
          {block.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      {block.actions && block.actions.length > 0 && (
        <div className="flex items-center gap-2">
          {block.actions.map((a, i) => (
            <ActionBtn key={i} a={a} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── checklist ───────────────────────────────────────────────────
export function ChecklistBlockView({ block }: { block: ChecklistBlock }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {block.title && <p className="text-xs font-medium text-foreground">{block.title}</p>}
      <ul className="space-y-1.5">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {item.done ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className={item.done ? "line-through text-muted-foreground" : "text-foreground"}>
                {item.label}
              </p>
              {item.hint && <p className="text-[11px] text-muted-foreground">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── status_panel ────────────────────────────────────────────────
const STATUS_META = {
  healthy: { Icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
  degraded: { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
  warning: { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
  critical: { Icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10 border-rose-500/30" },
  unknown: { Icon: HelpCircle, color: "text-muted-foreground", bg: "bg-muted/20 border-border" },
} as const;

export function StatusPanelBlockView({ block }: { block: StatusPanelBlock }) {
  const meta = STATUS_META[block.status];
  const Icon = meta.Icon;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${meta.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${meta.color}`} />
        <p className="text-sm font-medium text-foreground">{block.title ?? block.status}</p>
        <Badge variant="outline" className="text-[10px] capitalize ml-auto">
          {block.status}
        </Badge>
      </div>
      {block.summary && <p className="text-xs text-muted-foreground">{block.summary}</p>}
      {block.signals && block.signals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {block.signals.map((s, i) => (
            <div key={i} className="text-xs">
              <p className="text-[10px] uppercase text-muted-foreground">{s.label}</p>
              <p className="text-foreground font-medium">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── workflow_steps ──────────────────────────────────────────────
const STEP_META = {
  todo: "border-border bg-muted/20 text-muted-foreground",
  active: "border-primary/60 bg-primary/10 text-primary",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blocked: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
} as const;

export function WorkflowStepsBlockView({ block }: { block: WorkflowStepsBlock }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {block.title && <p className="text-xs font-medium text-foreground">{block.title}</p>}
      <ol className="flex flex-wrap gap-2">
        {block.steps.map((s, i) => (
          <li
            key={i}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STEP_META[s.status]}`}
            title={s.hint}
          >
            <span className="opacity-60 mr-1">{i + 1}.</span>
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}