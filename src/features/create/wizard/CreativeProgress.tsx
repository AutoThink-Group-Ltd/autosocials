import { Clapperboard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  phase: "checking" | "planning" | "starting" | "rendering";
  count: number;
  titles?: string[];
  detail?: string | null;
  readyCount?: number;
  activeCount?: number;
};

/** A saved job drives the words and counts. The animation never implies a made-up percentage. */
export function CreativeProgress({ phase, count, titles = [], detail, readyCount = 0, activeCount = 0 }: Props) {
  const rendering = phase === "rendering";
  const title = phase === "checking"
    ? "Opening your studio"
    : phase === "planning"
    ? `Sam is planning your ${count} video${count === 1 ? "" : "s"}`
    : phase === "starting"
      ? "Opening the studio"
      : `Your video${count === 1 ? " is" : "s are"} taking shape`;
  const description = phase === "checking"
    ? "Checking your saved video work and latest progress."
    : rendering
    ? "Production continues in the background. Finished videos appear below as soon as they are ready."
    : "Sam is preparing the briefs in the background. You can explore other pages and return here at any time.";

  return (
    <section className="build-in relative flex min-h-[62vh] flex-col justify-center overflow-hidden rounded-[20px] border-2 border-ink bg-surface-subtle px-5 py-10 md:px-10" aria-label="Video creation progress">
      <div className="build-orbit pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-2 border-dashed border-ink/15" aria-hidden />
      <div className="build-orbit pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full border-2 border-ink/10" style={{ animationDirection: "reverse" }} aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-inverse"><Sparkles className="h-4 w-4" /></span>
          AutoSocials Studio
          <span className="ml-auto rounded-full border border-border-control bg-surface px-3 py-1 text-ink">{rendering ? "Making" : phase === "checking" ? "Opening" : "Planning"}</span>
        </div>

        <div className="mt-8 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <h2 role="status" className="max-w-xl font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-tight">{title}<span className="build-wave inline-block" aria-hidden>…</span></h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted-foreground">{description}</p>
            {detail && <p className="mt-5 inline-flex rounded-[10px] border border-border-control bg-surface px-3 py-2 text-[13px] font-medium">{detail}</p>}
            {rendering && <p className="mt-5 text-[13px] font-semibold tabular-nums">{readyCount} of {count} ready · {activeCount} in production</p>}
          </div>

          <div className="relative mx-auto aspect-[4/5] w-44 md:w-52" aria-hidden>
            <div className="build-orbit absolute -inset-5 rounded-full border-2 border-dashed border-ink/25" />
            <div className="build-orbit absolute -inset-2 rounded-full border-2 border-ink/40" style={{ animationDirection: "reverse", borderTopColor: "transparent" }} />
            <div className="absolute inset-0 overflow-hidden rounded-[18px] border-2 border-ink bg-ink p-3 shadow-xl">
              <div className="flex h-full flex-col rounded-[10px] border border-inverse/30 bg-surface p-3">
                <div className="flex items-center justify-between"><Clapperboard className="h-5 w-5" /><span className="text-[10px] font-bold">AS / 01</span></div>
                <div className="flex flex-1 flex-col justify-center gap-2">
                  {[0, 1, 2].map((i) => <div key={i} className="build-rise rounded-[7px] border border-ink bg-surface-subtle p-2" style={{ animationDelay: `${i * 0.3}s` }}><div className="h-1 overflow-hidden rounded-full bg-ink/15"><div className="build-draw h-full bg-ink" style={{ animationDelay: `${i * 0.3}s` }} /></div><div className={cn("mt-1.5 h-1 rounded-full bg-ink/30", i === 1 ? "w-3/4" : "w-1/2")} /></div>)}
                </div>
                <div className="flex h-6 items-end gap-[3px]">{Array.from({ length: 14 }, (_, i) => <span key={i} className="build-wave flex-1 rounded-full bg-ink" style={{ height: "100%", animationDelay: `${(i % 5) * 0.13}s` }} />)}</div>
              </div>
            </div>
          </div>
        </div>

        {titles.length > 0 && <div className="mt-8 border-t border-border-control pt-5"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">In this set</p><ol className="mt-3 grid gap-2 sm:grid-cols-2">{titles.slice(0, 4).map((item, index) => <li key={`${index}-${item}`} className="flex min-w-0 items-center gap-3 rounded-[10px] border border-border-control bg-surface px-3 py-2 text-[13px]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-inverse">{index + 1}</span><span className="truncate font-medium">{item}</span></li>)}</ol></div>}
      </div>
    </section>
  );
}
