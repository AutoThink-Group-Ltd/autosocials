import type { ReactNode } from "react";
import { toast } from "sonner";
import { AppIcon } from "@/components/brand/AppIcon";
import { cn } from "@/lib/utils";

export function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-8">
      <h2 id={id} className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
      {intro && <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export async function copyText(value: string, what: string) {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${what}`, { description: value });
  } catch {
    toast.error(`Couldn't copy ${what}`, { description: "Clipboard access isn't available in this browser. Select the text instead." });
  }
}

export function CopyChip({ value, what, label }: { value: string; what: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyText(value, what)}
      aria-label={`Copy ${what}: ${value}`}
      className="inline-flex max-w-full items-center gap-1 rounded-[6px] border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink hover:bg-surface-subtle"
    >
      <span className="break-all text-left">{label ?? value}</span>
    </button>
  );
}

export function StatusTag({ status }: { status: string }) {
  const ok = status === "Matches" || status === "Pass" || status === "Loaded";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        ok && "border-border-control text-ink",
        (status === "Mismatch" || status === "Fail") && "border-destructive bg-danger-surface text-destructive",
        (status === "Missing" || status === "Unresolved" || status === "Not loaded" || status === "Decorative") && "border-warning bg-warning-surface text-warning",
      )}
    >
      {ok && <AppIcon name="check" size={12} />} {status}
    </span>
  );
}

export function Meta({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-20 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-all text-ink">{children}</span>
    </div>
  );
}
