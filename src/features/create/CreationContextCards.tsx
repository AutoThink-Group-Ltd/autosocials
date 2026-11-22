import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CreationContextMode } from "@/lib/creation-context-mode";
import { cn } from "@/lib/utils";

const cards = [
  { mode: "goals", title: "Generate from Goals", description: "Let Sam use your saved Goals, Profile DNA and Brand DNA to choose what to create.", icon: Sparkles },
  { mode: "idea", title: "New Idea", description: "Give Sam a fresh idea and choose whether to use your saved context.", icon: Lightbulb },
] as const;

export function CreationContextCards({ brief, onBriefChange, onGenerate, ideaOpen, onIdeaOpenChange, useDna, onUseDnaChange, busy, disabled, maxLength = 2000, minLength = 1, submitLabel, children, ideaOptions }: {
  brief: string;
  onBriefChange: (brief: string) => void;
  onGenerate: (mode: CreationContextMode) => void;
  ideaOpen: boolean;
  onIdeaOpenChange: (open: boolean) => void;
  useDna: boolean;
  onUseDnaChange: (enabled: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
  maxLength?: number;
  minLength?: number;
  submitLabel: string;
  children?: ReactNode;
  ideaOptions?: ReactNode;
}) {
  return <section aria-label="Choose how to start" className="@container space-y-4">
    {children}
    <div className="grid gap-3 @lg:grid-cols-2">
      {cards.map(({ mode, title, description, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          disabled={busy || (mode === "goals" && disabled)}
          aria-expanded={mode === "idea" ? ideaOpen : undefined}
          onClick={() => mode === "goals" ? onGenerate(mode) : onIdeaOpenChange(!ideaOpen)}
          className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-control bg-surface text-left transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          <span aria-hidden className={cn("relative flex h-24 items-center overflow-hidden px-5", mode === "goals" ? "bg-ink text-inverse" : "bg-surface-subtle text-ink")}>
            <Icon className="size-8" />
            <span className="absolute -right-4 top-4 size-28 rotate-12 rounded-3xl border-8 border-current opacity-10" />
            <span className="absolute right-10 top-10 size-20 -rotate-12 rounded-2xl border-4 border-current opacity-20" />
          </span>
          <span className="flex flex-1 items-start justify-between gap-3 p-4">
            <span><span className="block font-display text-lg font-bold">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
            <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      ))}
    </div>
    {ideaOpen && <form onSubmit={(event) => {
      event.preventDefault();
      if (!busy && !disabled && brief.trim().length >= minLength) onGenerate(useDna ? "idea" : "standalone");
    }} className="space-y-4 rounded-2xl border border-border-control bg-surface p-5">
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm font-semibold">
          Your idea
          <textarea rows={4} required maxLength={maxLength} value={brief} onChange={(event) => onBriefChange(event.target.value)} placeholder="What should this piece be about?" className="mt-2 block w-full rounded-xl border border-border-control bg-canvas p-3 font-normal" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-ink" checked={useDna} onChange={(event) => onUseDnaChange(event.target.checked)} />
          <span><span className="block font-semibold">Use saved Goals and DNA</span><span className="text-muted-foreground">Turn this off to work from your idea alone.</span></span>
        </label>
        {ideaOptions}
        <Button type="submit" disabled={disabled || brief.trim().length < minLength}>{submitLabel}</Button>
      </fieldset>
    </form>}
  </section>;
}
