import type { ReactNode } from "react";
import { MODULES, type ModuleId } from "@/brand/tokens";
import { MODULE_CONTRACTS } from "@/brand/modules";
import { AppIcon } from "@/components/brand/AppIcon";
import { cn } from "@/lib/utils";

/** Shared workspace primitives — the only building blocks stage surfaces should use. */

export function PaneToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b border-border px-3", className)}>{children}</div>;
}

export function StatusPill({ tone = "neutral", children }: { tone?: "neutral" | "positive" | "warning" | "danger"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      tone === "neutral" && "border-border-control text-text-secondary",
      tone === "positive" && "border-ink bg-ink text-inverse",
      tone === "warning" && "border-border-control bg-surface-subtle text-ink",
      tone === "danger" && "border-destructive text-destructive")}>{children}</span>
  );
}

export function UnavailableBadge({ label = "Not available yet" }: { label?: string }) {
  return <StatusPill tone="warning"><AppIcon name="warning" size={12} /> {label}</StatusPill>;
}

export function ContextChip({ parts }: { parts: (string | null | undefined)[] }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-surface-subtle px-2.5 py-1 text-[12px] text-text-secondary">
      {parts.filter(Boolean).join(" / ")}
    </span>
  );
}

export function StageHeader({ module, right }: { module: ModuleId; right?: ReactNode }) {
  const m = MODULES.find((x) => x.id === module)!;
  const c = MODULE_CONTRACTS[module];
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">Stage {m.number}</p>
        <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{m.label}</h1>
        <p className="mt-1 max-w-xl text-[15px] text-text-secondary">{c.description}</p>
      </div>
      {right ?? (!c.available && <UnavailableBadge />)}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-border-control bg-canvas px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface">{icon}</div>}
      <h2 className="font-display text-[18px] font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-[14px] text-text-secondary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Default surface for a stage awaiting its full build: honest, branded, explains what will live here. */
export function StageSurface({ module }: { module: ModuleId }) {
  const c = MODULE_CONTRACTS[module];
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <StageHeader module={module} />
      <EmptyState icon={<AppIcon name={module} size={18} />} title={c.defaultPreview} body={`Sam reads: ${c.snapshot}.`} />
      <section>
        <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">Words this stage uses</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(c.glossary).map(([k, v]) => (
            <div key={k} className="rounded-[12px] border border-border bg-surface p-3">
              <dt className="font-display text-[14px] font-bold capitalize">{k}</dt>
              <dd className="text-[13px] text-text-secondary">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-text-secondary">Ask Sam</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {c.starters.map((s) => <li key={s} className="rounded-[10px] border border-border-control bg-surface px-3 py-1.5 text-[13px]">“{s}”</li>)}
        </ul>
      </section>
    </div>
  );
}

/** Pill-shaped − value + stepper used instead of native number inputs. */
export function NumberStepper({ label, value, onChange, min = 1, max = 6 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  const btn = "flex h-8 w-8 items-center justify-center rounded-full text-[16px] text-text-secondary transition-colors hover:bg-surface-subtle hover:text-ink disabled:opacity-30";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="inline-flex h-10 items-center gap-1 rounded-full border border-border-control bg-canvas px-1">
        <button type="button" className={btn} onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <span className="w-6 text-center text-[14px] font-semibold tabular-nums text-ink" aria-live="polite">{value}</span>
        <button type="button" className={btn} onClick={() => set(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}
