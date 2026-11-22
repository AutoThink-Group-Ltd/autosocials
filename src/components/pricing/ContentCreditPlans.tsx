import { useState } from "react";
import { ArrowRight, Image, Video, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { CONTENT_CREDIT_PLANS, estimatedContent } from "@/config/contentCreditPlans";

type Plan = (typeof CONTENT_CREDIT_PLANS)[number];
export function ContentCreditPlans({ onSelect, loading, disabled = false }: { onSelect: (plan: Plan) => void; loading?: string | null; disabled?: boolean }) {
  const [index, setIndex] = useState(2);
  const plan = CONTENT_CREDIT_PLANS[index]!;
  const estimate = estimatedContent(plan.credits);
  return <section aria-label="Choose your monthly plan" className="mx-auto max-w-5xl">
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
      <div className="grid lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-8 p-7 sm:p-10">
          <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Your creative capacity</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Find your perfect pace.</h2><p className="mt-3 text-muted-foreground">Move the slider to see what each monthly plan makes possible.</p></div>
          <div className="space-y-5"><Slider min={0} max={4} step={1} value={[index]} onValueChange={([value]) => setIndex(value ?? 0)} aria-label="Select a monthly credit plan" />
            <div className="grid grid-cols-5 gap-1">{CONTENT_CREDIT_PLANS.map((item, i) => <button key={item.key} type="button" onClick={() => setIndex(i)} aria-pressed={index === i} className={`rounded-lg px-1 py-2 text-xs sm:text-sm ${index === i ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted"}`}>{item.name}</button>)}</div>
          </div>
          <div className="rounded-2xl bg-muted/50 p-5"><div className="flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-primary" /> {plan.credits.toLocaleString("en-GB")} credits each month</div><p className="mt-2 text-sm text-muted-foreground">Create with the engines you choose. Credits reset each month.</p></div>
        </div>
        <div className="flex flex-col justify-between gap-7 border-t border-border bg-muted/30 p-7 sm:p-10 lg:border-l lg:border-t-0">
          <div><p className="text-sm font-semibold text-primary">{plan.name}</p><p className="mt-2 text-5xl font-bold tracking-tight">£{plan.monthlyPricePence / 100}<span className="text-base font-normal text-muted-foreground"> / month</span></p><p className="mt-5 text-sm text-muted-foreground">Your monthly credits could create approximately:</p>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-border bg-card p-4"><Video className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-bold">{estimate.videos}</p><p className="text-xs text-muted-foreground">60-second videos</p></div><div className="rounded-xl border border-border bg-card p-4"><Image className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-bold">{estimate.images}</p><p className="text-xs text-muted-foreground">images</p></div></div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Videos or images, or a mix of both. Estimates use average credit costs; actual output varies by engine and settings.</p>
          </div>
          <Button size="lg" className="w-full" onClick={() => onSelect(plan)} disabled={!!loading || disabled}>{loading === plan.key ? "Opening checkout…" : plan.key === "free" ? "Get started free" : `Choose ${plan.name}`}<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  </section>;
}
