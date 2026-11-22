import type {
  AnswerEvidenceBlock,
  KpiCardsBlock,
  ActionRowBlock,
  NextBestActionBlock,
  ApprovalCardBlock,
  RecordPreviewBlock,
  TaskPreviewBlock,
  EmailPreviewBlock,
  FormBlock,
  MultiSourceViewBlock,
  TimelineSnapshotBlock,
  DataQualityPanelBlock,
  EmptyStateBlock,
  ErrorStateBlock,
  LoadingStateBlock,
  ActionButton,
} from "../types";
import type { ActionHandler } from "./ActionsBlock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Inbox,
  Loader2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const variantMap = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "destructive",
} as const;

function ActionBtn({
  a,
  onAction,
  size = "sm",
}: {
  a: ActionButton;
  onAction?: ActionHandler | undefined;
  size?: "sm" | "default";
}) {
  return (
    <Button
      size={size}
      variant={variantMap[a.variant]}
      onClick={() => onAction?.(a)}
      className="gap-1.5"
    >
      {(a.requiresConfirmation || a.riskLevel === "high" || a.riskLevel === "destructive") && (
        <ShieldAlert className="w-3.5 h-3.5" />
      )}
      {a.label}
    </Button>
  );
}

// ── answer_evidence ──────────────────────────────────────────────
export function AnswerEvidenceBlockView({
  block,
  onAction,
}: {
  block: AnswerEvidenceBlock;
  onAction?: ActionHandler | undefined;
}) {
  const conf = block.confidence;
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm text-foreground leading-relaxed">{block.answer}</p>
      {block.reasoning && (
        <p className="text-xs text-muted-foreground italic">{block.reasoning}</p>
      )}
      {block.evidence && block.evidence.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
          {block.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {block.sources?.map((s, i) =>
            s.url ? (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] underline text-primary hover:opacity-80"
              >
                {s.label}
              </a>
            ) : (
              <Badge key={i} variant="outline" className="text-[10px]">
                {s.label}
              </Badge>
            ),
          )}
        </div>
        {conf && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] capitalize",
              conf === "high" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
              conf === "medium" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
              conf === "low" && "border-rose-500/40 text-rose-600 dark:text-rose-400",
            )}
          >
            {conf} confidence
          </Badge>
        )}
      </div>
      {block.suggestedNextAction && (
        <ActionBtn a={block.suggestedNextAction} onAction={onAction} />
      )}
    </div>
  );
}

// ── kpi_cards ────────────────────────────────────────────────────
export function KpiCardsBlockView({ block }: { block: KpiCardsBlock }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {block.cards.map((c, i) => {
        const Icon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
        const statusBorder = {
          positive: "border-emerald-500/40",
          neutral: "border-border",
          warning: "border-amber-500/40",
          critical: "border-rose-500/40",
        }[c.status ?? "neutral"];
        return (
          <div
            key={i}
            className={cn("rounded-lg border bg-card p-3 space-y-1", statusBorder)}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="text-lg font-semibold text-foreground">{c.value}</p>
            {c.delta && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Icon className="w-3 h-3" />
                {c.delta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── action_row ───────────────────────────────────────────────────
export function ActionRowBlockView({
  block,
  onAction,
}: {
  block: ActionRowBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      {block.prompt && <p className="text-sm text-foreground">{block.prompt}</p>}
      <div className="flex flex-wrap gap-2">
        {block.actions.map((a, i) => (
          <ActionBtn key={i} a={a} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

// ── next_best_action ─────────────────────────────────────────────
export function NextBestActionBlockView({
  block,
  onAction,
}: {
  block: NextBestActionBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{block.title}</p>
      </div>
      {block.rationale && (
        <p className="text-xs text-muted-foreground">{block.rationale}</p>
      )}
      <Button
        size="sm"
        variant={variantMap[block.action.variant]}
        onClick={() => onAction?.(block.action)}
        className="gap-1.5 w-full"
      >
        {block.action.label}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ── approval_card ────────────────────────────────────────────────
export function ApprovalCardBlockView({
  block,
  onAction,
}: {
  block: ApprovalCardBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 space-y-3",
        block.riskLevel === "destructive"
          ? "border-rose-500/40 bg-rose-500/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-foreground" />
        <p className="text-sm font-semibold text-foreground">{block.title}</p>
        <Badge variant="outline" className="ml-auto text-[10px] capitalize">
          {block.riskLevel}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{block.summary}</p>
      <div className="flex gap-2">
        <ActionBtn a={block.approve} onAction={onAction} />
        {block.reject && <ActionBtn a={block.reject} onAction={onAction} />}
      </div>
    </div>
  );
}

// ── record_preview ───────────────────────────────────────────────
export function RecordPreviewBlockView({
  block,
  onAction,
}: {
  block: RecordPreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <Badge variant="outline" className="text-[10px] capitalize mb-1">
          {block.entity}
        </Badge>
        <p className="text-sm font-semibold text-foreground">{block.title}</p>
        {block.subtitle && (
          <p className="text-xs text-muted-foreground">{block.subtitle}</p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {block.fields.map((f, i) => (
          <div key={i} className="flex flex-col">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="text-foreground font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>
      {block.actions && block.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {block.actions.map((a, i) => (
            <ActionBtn key={i} a={a} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── task_preview ─────────────────────────────────────────────────
export function TaskPreviewBlockView({
  block,
  onAction,
}: {
  block: TaskPreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  const Icon = block.status === "done" ? CheckCircle2 : Clock;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{block.title}</p>
          {block.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{block.description}</p>
          )}
          <div className="flex gap-2 mt-1.5 text-[11px] text-muted-foreground">
            {block.assignee && <span>@{block.assignee}</span>}
            {block.dueAt && <span>· due {block.dueAt}</span>}
            <Badge variant="outline" className="text-[10px] capitalize ml-auto">
              {block.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>
      {block.actions && (
        <div className="flex flex-wrap gap-2">
          {block.actions.map((a, i) => (
            <ActionBtn key={i} a={a} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── email_preview ────────────────────────────────────────────────
export function EmailPreviewBlockView({
  block,
  onAction,
}: {
  block: EmailPreviewBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2 space-y-0.5">
        <p className="text-[11px] text-muted-foreground">
          {block.from && <span>From: {block.from} · </span>}
          To: {block.to}
        </p>
        <p className="text-sm font-semibold text-foreground">{block.subject}</p>
      </div>
      <div className="px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
        {block.body}
      </div>
      {block.actions && (
        <div className="border-t border-border px-4 py-2 flex gap-2">
          {block.actions.map((a, i) => (
            <ActionBtn key={i} a={a} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── form ─────────────────────────────────────────────────────────
export function FormBlockView({
  block,
  onAction,
}: {
  block: FormBlock;
  onAction?: ActionHandler | undefined;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAction?.({
          label: block.submitLabel,
          action: block.submitAction,
          payload: values,
          variant: "primary",
          requiresConfirmation: false,
        });
      }}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      {block.title && <p className="text-sm font-semibold text-foreground">{block.title}</p>}
      {block.description && (
        <p className="text-xs text-muted-foreground">{block.description}</p>
      )}
      <div className="space-y-3">
        {block.fields.map((f) => (
          <div key={f.name} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            {f.kind === "text" && (
              <Input
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.kind === "textarea" && (
              <Textarea
                placeholder={f.placeholder}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.kind === "number" && (
              <Input
                type="number"
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.name, e.target.valueAsNumber)}
              />
            )}
            {f.kind === "date" && (
              <Input type="date" onChange={(e) => set(f.name, e.target.value)} />
            )}
            {f.kind === "toggle" && (
              <Switch onCheckedChange={(v) => set(f.name, v)} />
            )}
            {f.kind === "select" && (
              <Select onValueChange={(v) => set(f.name, v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" className="w-full">
        {block.submitLabel}
      </Button>
    </form>
  );
}

// ── multi_source_view ────────────────────────────────────────────
export function MultiSourceViewBlockView({ block }: { block: MultiSourceViewBlock }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-xs">
      {block.sourcesUsed && block.sourcesUsed.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Sources used
          </p>
          <div className="flex flex-wrap gap-1.5">
            {block.sourcesUsed.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {s.label}
                {s.freshness && <span className="ml-1 opacity-60">· {s.freshness}</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {block.sourcesUnavailable && block.sourcesUnavailable.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Unavailable
          </p>
          <div className="flex flex-wrap gap-1.5">
            {block.sourcesUnavailable.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[10px] opacity-60">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {block.lastUpdated && <span>Updated {block.lastUpdated}</span>}
        {typeof block.completeness === "number" && (
          <span>{Math.round(block.completeness * 100)}% complete</span>
        )}
      </div>
      {typeof block.completeness === "number" && (
        <Progress value={block.completeness * 100} className="h-1" />
      )}
    </div>
  );
}

// ── timeline_snapshot ────────────────────────────────────────────
export function TimelineSnapshotBlockView({ block }: { block: TimelineSnapshotBlock }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {block.title && <p className="text-sm font-semibold text-foreground">{block.title}</p>}
      <ol className="space-y-2 border-l border-border pl-3">
        {block.events.map((e, i) => (
          <li key={i} className="text-xs">
            <p className="text-muted-foreground">{e.timestamp}</p>
            <p className="text-foreground">
              <span className="font-medium">{e.eventType}</span>
              {e.actor && <span className="opacity-60"> · {e.actor}</span>}
            </p>
            <p className="text-muted-foreground">{e.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── data_quality_panel ───────────────────────────────────────────
export function DataQualityPanelBlockView({ block }: { block: DataQualityPanelBlock }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Data quality</p>
        {typeof block.completeness === "number" && (
          <span className="text-foreground font-medium">
            {Math.round(block.completeness * 100)}%
          </span>
        )}
      </div>
      {typeof block.completeness === "number" && (
        <Progress value={block.completeness * 100} className="h-1" />
      )}
      {block.freshness && (
        <p className="text-muted-foreground">Freshness: {block.freshness}</p>
      )}
      {block.gaps && block.gaps.length > 0 && (
        <div>
          <p className="text-muted-foreground">Gaps:</p>
          <ul className="list-disc list-inside">
            {block.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {block.suggestedFixes && block.suggestedFixes.length > 0 && (
        <div>
          <p className="text-muted-foreground">Suggested fixes:</p>
          <ul className="list-disc list-inside">
            {block.suggestedFixes.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── empty / error / loading ──────────────────────────────────────
export function EmptyStateBlockView({
  block,
  onAction,
}: {
  block: EmptyStateBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center space-y-2">
      <Inbox className="w-6 h-6 text-muted-foreground mx-auto" />
      <p className="text-sm font-medium text-foreground">{block.title}</p>
      {block.body && <p className="text-xs text-muted-foreground">{block.body}</p>}
      {block.action && <ActionBtn a={block.action} onAction={onAction} />}
    </div>
  );
}

export function ErrorStateBlockView({
  block,
  onAction,
}: {
  block: ErrorStateBlock;
  onAction?: ActionHandler | undefined;
}) {
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-rose-500" />
        <p className="text-sm font-medium text-foreground">{block.title}</p>
      </div>
      {block.body && <p className="text-xs text-muted-foreground">{block.body}</p>}
      {block.retryAction && <ActionBtn a={block.retryAction} onAction={onAction} />}
    </div>
  );
}

export function LoadingStateBlockView({ block }: { block: LoadingStateBlock }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 p-3">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {block.label ?? "Working…"}
    </div>
  );
}