import { useEffect, useState } from "react";

type Idea = { angle: string; hook: string; format?: string | undefined; notes?: string | undefined };
type Props = {
  ideas: Idea[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  onEdit: (index: number, hook: string) => void;
  onUse: (indexes: number[]) => Promise<void>;
};

function visualKind(idea: Idea): "budget" | "research" | "contrast" | "story" {
  const words = `${idea.hook} ${idea.angle} ${idea.notes ?? ""}`.toLowerCase();
  if (/£|budget|spend|money|cost|price/.test(words)) return "budget";
  if (/research|market|competitor|evidence|data|search/.test(words))
    return "research";
  if (/before|after|versus|vs\b|instead|different|ai/.test(words))
    return "contrast";
  return "story";
}

function ConceptVisual({ idea, beat }: { idea: Idea; beat: number }) {
  const kind = visualKind(idea);
  return (
    <div
      key={`${idea.hook}:${beat}`}
      className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[20px] bg-ink p-6 text-inverse motion-safe:animate-[concept-enter_450ms_ease-out_both] sm:min-h-[350px] sm:p-9"
    >
      <div className="relative z-10 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
        <span>
          {beat === 0 ? "The hook" : beat === 1 ? "The visual" : "The payoff"}
        </span>
        <span>0{beat + 1} / 03</span>
      </div>
      {beat === 1 ? (
        <div
          className="relative z-10 flex h-36 items-end justify-center gap-3"
          aria-hidden="true"
        >
          {kind === "budget" ? (
            [55, 100, 72].map((height, index) => (
              <div
                key={index}
                className="w-1/5 rounded-t-[14px] border border-inverse/50 bg-inverse/15 transition-all duration-700"
                style={{ height: `${height}%` }}
              />
            ))
          ) : kind === "research" ? (
            <>
              <div className="h-24 w-24 rounded-full border-[10px] border-inverse/70" />
              <div className="mb-2 h-4 w-20 -rotate-45 rounded-full bg-inverse/70" />
            </>
          ) : kind === "contrast" ? (
            <>
              <div className="h-32 w-1/3 rounded-[16px] border border-inverse/40 bg-inverse/10" />
              <div className="mb-14 text-3xl">→</div>
              <div className="h-32 w-1/3 rounded-[16px] border-2 border-inverse bg-inverse/30" />
            </>
          ) : (
            <>
              <div className="h-24 w-24 -rotate-12 rounded-[18px] border border-inverse/50 bg-inverse/10" />
              <div className="h-32 w-24 rotate-6 rounded-[18px] border-2 border-inverse bg-inverse/25" />
              <div className="h-20 w-24 -rotate-6 rounded-[18px] border border-inverse/50 bg-inverse/10" />
            </>
          )}
        </div>
      ) : (
        <div className="relative z-10 max-w-[680px] text-balance font-display text-[clamp(25px,3.5vw,52px)] font-bold leading-[1.08]">
          {beat === 0 ? idea.hook : idea.angle}
        </div>
      )}
      <div className="relative z-10 max-w-[650px] text-[13px] leading-relaxed opacity-80">
        {beat === 1
          ? (idea.notes?.split(/[.!?]\s/)[0] || idea.angle).slice(0, 160)
          : beat === 2
            ? idea.format || "A short video concept"
            : "A quick sketch of Sam’s idea"}
      </div>
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border-[36px] border-inverse/10"
        aria-hidden="true"
      />
    </div>
  );
}

export function ConceptPreview({
  ideas,
  selected,
  onToggle,
  onEdit,
  onUse,
}: Props) {
  const [active, setActive] = useState(0);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(ideas[0]?.hook ?? "");
  const idea = ideas[Math.min(active, ideas.length - 1)];
  useEffect(() => {
    setDraft(idea?.hook ?? "");
  }, [idea?.hook]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      setPlaying(false);
  }, []);
  useEffect(() => {
    if (!playing || !ideas.length) return;
    const timer = window.setInterval(
      () => setBeat((current) => (current + 1) % 3),
      2200,
    );
    return () => window.clearInterval(timer);
  }, [playing, ideas.length]);
  if (!idea) return null;
  const go = (next: number) => {
    setActive((next + ideas.length) % ideas.length);
    setBeat(0);
  };
  const chosen = [...selected]
    .filter((index) => index < ideas.length)
    .sort((a, b) => a - b);
  return (
    <section className="space-y-4" aria-label="Sam's video concepts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Sam’s concept reel
          </p>
          <h3 className="font-display text-[22px] font-bold">
            See the idea before you build it
          </h3>
        </div>
        <span className="text-[12px] text-muted-foreground">
          Illustrative sketch · no video credits used
        </span>
      </div>
      <ConceptVisual idea={idea} beat={beat} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous idea"
            className="rounded-[10px] border border-border px-3 py-2"
          >
            ←
          </button>
          <span className="min-w-12 text-center text-[13px] font-semibold tabular-nums">
            {active + 1} / {ideas.length}
          </span>
          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next idea"
            className="rounded-[10px] border border-border px-3 py-2"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="rounded-[10px] border border-border px-3 py-2 text-[12px]"
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onToggle(active)}
          aria-pressed={selected.has(active)}
          className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold ${selected.has(active) ? "border border-border bg-surface" : "bg-ink text-inverse"}`}
        >
          {selected.has(active) ? "✓ Saved to selection" : "Select this idea"}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ideas.map((item, index) => (
          <button
            key={index}
            type="button"
            onClick={() => go(index)}
            aria-label={`View idea ${index + 1}: ${item.hook}`}
            aria-current={active === index ? "true" : undefined}
            className={`min-w-[170px] max-w-[230px] flex-1 rounded-[12px] border p-3 text-left text-[12px] ${active === index ? "border-border-control bg-surface" : "border-border"}`}
          >
            <span className="mb-1 block font-semibold">
              {selected.has(index) ? "✓ " : ""}0{index + 1}
            </span>
            <span className="line-clamp-2">{item.hook}</span>
          </button>
        ))}
      </div>
      <details className="rounded-[12px] border border-border p-3 text-[13px]">
        <summary className="cursor-pointer font-semibold">
          Edit this hook or read Sam’s production notes
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block text-[12px] text-muted-foreground">
            Hook
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (draft !== idea.hook) onEdit(active, draft);
              }}
              className="mt-1 w-full rounded-[10px] border border-border bg-surface p-2 text-foreground"
              rows={2}
            />
          </label>
          <p>
            <strong>Angle:</strong> {idea.angle}
          </p>
          {idea.format && (
            <p>
              <strong>Format:</strong> {idea.format}
            </p>
          )}
          {idea.notes && (
            <p>
              <strong>Notes:</strong> {idea.notes}
            </p>
          )}
        </div>
      </details>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border-control bg-canvas px-4 py-3 shadow-md">
        <span className="text-[13px] font-medium">
          {chosen.length} idea{chosen.length === 1 ? "" : "s"} selected
        </span>
        <button
          type="button"
          disabled={!chosen.length || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onUse(chosen);
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse disabled:opacity-50"
        >
          {saving
            ? "Opening Create…"
            : `Continue with ${chosen.length || ""} idea${chosen.length === 1 ? "" : "s"} →`}
        </button>
      </div>
    </section>
  );
}
