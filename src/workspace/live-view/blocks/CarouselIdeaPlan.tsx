import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { carouselOutline, missingCarouselLogos, type CarouselDraft } from "@/lib/linkedin-carousel";
import { planLinkedInCarousel } from "@/lib/linkedin-carousel.functions";
import { Markdown } from "./Markdown";

type Idea = { hook: string; angle: string; notes?: string | undefined; carousel_plan?: CarouselDraft | undefined };
const action = "rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-inverse disabled:opacity-50";

export function CarouselIdeaPlan({ idea, workspaceId, savedDraft, onPlan, onOpen }: {
  idea: Idea;
  workspaceId: string | null;
  savedDraft?: string | undefined;
  onPlan: (plan: CarouselDraft) => void | Promise<void>;
  onOpen?: ((plan: CarouselDraft) => void) | undefined;
}) {
  const draftSlides = useServerFn(planLinkedInCarousel);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const plan = idea.carousel_plan;
  const outline = plan || savedDraft ? null : carouselOutline(idea.notes ?? "");

  async function prepareSlides() {
    if (!workspaceId || planning) return;
    setPlanning(true);
    setError("");
    try {
      const brief = [
        "Develop this saved LinkedIn carousel into at most six slides by combining related points. Preserve numeric figures, stated time periods, product names, the opener and the takeaway.",
        savedDraft ?? [`Hook: ${idea.hook}`, `Angle: ${idea.angle}`, idea.notes].filter(Boolean).join("\n"),
      ].filter(Boolean).join("\n").slice(0, 12000);
      const result = await draftSlides({ data: { workspace_id: workspaceId, brief } });
      await onPlan({
        ...result,
        slides: result.slides.map(({ id: _id, ...slide }) => slide),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sam couldn’t draft the slides. Try again.");
    } finally {
      setPlanning(false);
    }
  }

  return <section className="space-y-4" aria-label={plan || savedDraft ? "LinkedIn carousel slide plan" : "LinkedIn carousel outline"}>
    <header className="space-y-1">
      <p className="text-sm font-semibold text-muted-foreground">
        {plan ? `Carousel plan · ${plan.slides.length} slides` : savedDraft ? "Saved carousel plan" : "Carousel outline"}
      </p>
      {!savedDraft && <h3 className="text-balance break-words font-display text-2xl font-bold">{plan?.title ?? idea.hook}</h3>}
      <p className="max-w-2xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
        {plan ? <><strong className="text-foreground">Reader takeaway</strong> {plan.promise}</> : idea.angle}
      </p>
    </header>
    {plan ? <>
      <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        {plan.slides.map((slide, index) => <li key={index} className="min-w-0 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            Slide {index + 1}{index === 0 ? " · Cover" : index === plan.slides.length - 1 ? " · Takeaway" : ""}
          </p>
          <h4 className="mt-2 break-words text-base font-semibold">{slide.headline}</h4>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{slide.supporting}</p>
          {slide.quote && <blockquote className="mt-3 border-l-2 border-border pl-3">
            {slide.quote.text}<footer className="mt-1 text-xs">{slide.quote.speaker} · <a className="underline" href={slide.quote.sourceUrl} target="_blank" rel="noopener noreferrer">{slide.quote.sourceTitle}</a></footer>
          </blockquote>}
          {slide.quoteNotice && <p className="text-sm text-muted-foreground">{slide.quoteNotice}</p>}
          {!!slide.logos?.length && <ul className="mt-3 flex flex-wrap gap-3" aria-label="Product logo sources">
            {slide.logos.map((logo) => <li key={logo.name}>
              <a href={logo.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs underline">
                <img src={logo.image} alt="" className="h-8 w-12 rounded bg-white object-contain p-1" />{logo.name}
              </a>
            </li>)}
          </ul>}
          {!!missingCarouselLogos(slide).length && <p className="mt-2 text-xs text-muted-foreground">
            Logo unavailable for {missingCarouselLogos(slide).join(", ")}.
          </p>}
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="block font-semibold">Design direction</strong> {slide.direction}
          </p>
        </li>)}
      </ol>
      {onOpen && <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={action} onClick={() => onOpen(plan)}>Open in carousel editor</button>
        <p className="text-sm text-muted-foreground">Review or edit the copy before building the design.</p>
      </div>}
    </> : <>
      {savedDraft && <div className="rounded-xl border border-border bg-surface p-5"><Markdown source={savedDraft} /></div>}
      {!!outline?.slides.length && <ol className="divide-y divide-border rounded-xl border border-border bg-surface">
        {outline.slides.map((beat, index) => <li key={index} className="flex gap-3 px-4 py-3 text-sm">
          <span className="shrink-0 font-semibold">Slide {index + 1}</span><span className="min-w-0 break-words">{beat}</span>
        </li>)}
      </ol>}
      {outline?.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{outline.notes}</p>}
      {workspaceId && onOpen && <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={action} disabled={planning} onClick={() => void prepareSlides()}>
          {planning ? "Drafting slides…" : savedDraft ? "Prepare plan for editor" : "Draft slide copy"}
        </button>
        <p className="text-sm text-muted-foreground">{savedDraft ? "Fit the draft to the editor’s six-slide limit." : "Prepare the copy and design direction for each slide."}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>}
  </section>;
}
