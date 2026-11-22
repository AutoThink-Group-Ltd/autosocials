import { Check, FileText, Image, Palette, ArrowRight } from "lucide-react";
export function CreationGuide({ story, style, onStory, onStyle }: { story: boolean; style: boolean; onStory: () => void; onStyle: () => void }) {
  return <section aria-label="Sam's next step" className="rounded-2xl border border-border-control bg-surface-subtle p-4">
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-inverse">S</span>{!story ? "Let's choose your story" : !style ? "Let's choose your visual direction" : "Ready to prepare your brief and media"}</div>
    <div className="grid gap-2 sm:grid-cols-3">
      <button type="button" onClick={onStory} className="flex items-center gap-2 rounded-xl bg-surface p-3 text-left text-sm"><FileText className="h-5 w-5" /><span className="flex-1">Story / brief</span>{story ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}</button>
      <button type="button" onClick={onStyle} className="flex items-center gap-2 rounded-xl bg-surface p-3 text-left text-sm"><Palette className="h-5 w-5" /><span className="flex-1">Visual style</span>{style ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}</button>
      <div className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm text-muted-foreground"><Image className="h-5 w-5" /><span>Media · choose during preparation</span></div>
    </div>
  </section>;
}
