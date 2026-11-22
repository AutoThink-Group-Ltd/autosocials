import { useRef } from "react";
import { Check, ChevronLeft, ChevronRight, ImageIcon, Sparkles } from "lucide-react";
import type { CarouselPlan, CarouselSlide } from "@/lib/linkedin-carousel";
import { cn } from "@/lib/utils";

export type CarouselBuildStep = {
  index: number;
  phase: "artwork" | "waiting" | "compose" | "saved";
  artworkUrl?: string;
};

const phaseLabels = {
  artwork: "Creating the illustration",
  waiting: "Waiting for the illustration",
  compose: "Composing the slide",
  saved: "Slide saved",
} as const;

function SlideSketch({ slide, artworkUrl }: { slide: CarouselSlide; artworkUrl?: string | undefined }) {
  const design = slide.design;
  const illustration = design?.treatment === "illustration";
  const split = illustration && design.composition === "right";
  const full = illustration && design.composition === "full";
  const graphic = <div className={cn("relative grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-md border border-dashed border-current/40 bg-current/5", full ? "absolute inset-0" : split ? "min-h-full" : "min-h-[26cqw]")}>
    {artworkUrl ? <img src={artworkUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <>
      <span aria-hidden className="absolute left-[18%] top-[16%] size-[46%] min-w-[26cqw] rotate-12 rounded-[35%] border border-current/20" />
      <span aria-hidden className="absolute bottom-[10%] right-[12%] size-[44%] min-w-[24cqw] -rotate-12 rounded-[35%] border border-current/20" />
      <ImageIcon aria-hidden className="size-[9cqw] opacity-65" />
    </>}
  </div>;

  return <div className="absolute inset-0 flex flex-col justify-center overflow-hidden bg-surface-subtle p-[6cqw] text-ink"
    style={design ? { color: design.ink, backgroundColor: design.paper } : undefined}>
    <div className={cn("relative grid min-h-0 flex-1 gap-[4cqw] rounded-lg border border-dashed border-current/35 p-[5cqw]", split && "grid-cols-[1.15fr_1fr]")}>
      {illustration && !split && graphic}
      <div className={cn("relative flex min-w-0 flex-col justify-center gap-[3cqw]", full && "self-end rounded-md bg-surface/90 p-[3cqw] text-ink")}>
        <span aria-hidden className="h-[0.8cqw] w-[11cqw] rounded-full bg-current opacity-70" style={design ? { backgroundColor: design.accent } : undefined} />
        <p className={cn("break-words font-bold leading-[1.08]", split ? "text-[clamp(13px,4.6cqw,29px)]" : "text-[clamp(15px,6cqw,34px)]", design?.typeface === "serif" ? "font-serif" : "font-display")}>{slide.quote?.text ?? slide.headline}</p>
        <p className={cn("break-words leading-snug", split ? "text-[clamp(10px,2.9cqw,16px)]" : "text-[clamp(11px,3.4cqw,19px)]")}>{slide.quote?.speaker ?? slide.supporting}</p>
      </div>
      {split && graphic}
    </div>
  </div>;
}

export function CarouselStoryboard({ plan, images, active, onSelect, building, step, preview = false, squareFrame = preview }: {
  plan: CarouselPlan;
  images: { id: string; url: string }[];
  active: number;
  onSelect: (index: number) => void;
  building?: boolean;
  step?: CarouselBuildStep | null;
  preview?: boolean;
  squareFrame?: boolean;
}) {
  const touchStart = useRef<number | null>(null);
  const wheelTime = useRef(0);
  const slide = plan.slides[active] ?? plan.slides[0]!;
  const imageBySlide = new Map(images.map((image) => [image.id, image.url]));
  const currentUrl = preview ? undefined : imageBySlide.get(slide.id);
  const currentStep = step?.index === active ? step : null;
  const portrait = slide.design?.aspect === "portrait";
  const fitPortraitInSquare = squareFrame && portrait;
  const move = (by: number) => {
    if (!building) onSelect(Math.max(0, Math.min(plan.slides.length - 1, active + by)));
  };

  return <section tabIndex={0} aria-label="Carousel preview" className="mx-auto w-full max-w-[min(100%,61svh)] space-y-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
    onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}
    onWheel={(event) => {
      if (Math.abs(event.deltaX) > 30 && Date.now() - wheelTime.current > 350) {
        wheelTime.current = Date.now();
        move(event.deltaX > 0 ? 1 : -1);
      }
    }}
    onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
    onTouchEnd={(event) => {
      const end = event.changedTouches[0]?.clientX;
      const start = touchStart.current;
      touchStart.current = null;
      if (start != null && end != null && Math.abs(end - start) > 40) move(end < start ? 1 : -1);
    }}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="font-semibold" aria-live="polite">
        {building && currentStep ? `Slide ${active + 1} of ${plan.slides.length} · ${phaseLabels[currentStep.phase]}` : preview ? "Layout preview" : currentUrl ? "Finished slide" : "Planned slide"}
      </p>
      {building && <span className="tabular-nums text-muted-foreground">{images.length} of {plan.slides.length} saved</span>}
    </div>
    <div className={fitPortraitInSquare ? "grid aspect-square place-items-center rounded-2xl border border-border bg-surface-subtle" : undefined}>
      <div key={`${slide.id}:${currentUrl ? "ready" : "draft"}`} className={cn(
        "@container relative mx-auto overflow-hidden rounded-2xl border border-border-control bg-surface shadow-sm motion-safe:animate-[build-in_260ms_ease-out_both]",
        portrait ? "aspect-[4/5]" : "aspect-square",
        fitPortraitInSquare ? "w-4/5" : portrait ? "w-full max-w-[48svh]" : "w-full",
      )}>
        {currentUrl ? <img src={currentUrl} alt={`Slide ${active + 1}: ${slide.headline}. ${slide.supporting}`} className="size-full object-contain" /> : <SlideSketch slide={slide} artworkUrl={currentStep?.artworkUrl} />}
        {building && currentStep?.phase !== "saved" && !currentUrl && <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-surface/30 to-transparent motion-safe:animate-[studio-scan_2s_ease-in-out_infinite]" />
          <span className="absolute right-3 top-3 rounded-full bg-ink p-2 text-inverse shadow-sm motion-safe:animate-pulse"><Sparkles className="size-4" /></span>
        </div>}
      </div>
    </div>
    <div className="flex items-center justify-between gap-2">
      <button type="button" className="rounded-lg border border-border-control bg-surface p-2 disabled:opacity-40" aria-label="Previous slide" disabled={building || active === 0} onClick={() => move(-1)}><ChevronLeft className="size-5" /></button>
      <span aria-live={building ? "off" : "polite"} className="text-sm font-semibold tabular-nums">{active + 1}/{plan.slides.length}</span>
      <button type="button" className="rounded-lg border border-border-control bg-surface p-2 disabled:opacity-40" aria-label="Next slide" disabled={building || active === plan.slides.length - 1} onClick={() => move(1)}><ChevronRight className="size-5" /></button>
    </div>
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Jump to slide">
      {plan.slides.map((item, index) => {
        const url = preview ? undefined : imageBySlide.get(item.id);
        return <button type="button" key={item.id} aria-label={`Show slide ${index + 1}${url ? ", saved" : ""}`} aria-current={index === active ? "step" : undefined}
          disabled={building} onClick={() => onSelect(index)} className="relative grid size-9 place-items-center overflow-hidden rounded-md border border-border-control bg-surface-subtle text-xs font-semibold aria-[current=step]:border-ink aria-[current=step]:ring-1 aria-[current=step]:ring-ink sm:size-11">
          {url ? <><img src={url} alt="" className="size-full object-cover" /><Check aria-hidden className="absolute bottom-0.5 right-0.5 size-3 rounded-full bg-surface p-0.5 text-ink" /></> : index + 1}
        </button>;
      })}
    </div>
  </section>;
}
