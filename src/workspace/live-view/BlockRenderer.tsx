import { CampaignCard } from "@/features/sam/CampaignCard";
import { OutreachBlock } from "./blocks/OutreachBlock";
import { SocialTilesBlock } from "./blocks/SocialTilesBlock";
import { DirectVideoBlock } from "./DirectVideoBlock";
import { YouTubeGallery } from "./blocks/YouTubeGallery";
import { VirloResearchBlock } from "./blocks/VirloResearchBlock";
import { VirloActionBlock } from "./blocks/VirloActionBlock";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fileIdsIn, type Block } from "@/lib/sam.blocks";
import { AppIcon } from "@/components/brand/AppIcon";
import { useServerFn } from "@tanstack/react-start";
import { prepareStoryboardVideo } from "@/lib/storyboard-video.functions";
import { StudioCtx, usePreviewMap } from "./blocks/usePreviews";
import { ConceptPreview } from "./blocks/ConceptPreview";
import { CarouselIdeaPlan } from "./blocks/CarouselIdeaPlan";
import { isLinkedInCarouselIdea, type CarouselDraft } from "@/lib/linkedin-carousel";
import { findSocialTilePlan } from "./social-tile-plan";
import { PostcardTileBatch } from "@/features/create/PostcardTilesDesign";
import { canvasTileRunKey } from "@/lib/social-tile-run";
import { AssetsBlock, CompareBlock, ConfirmBlock, DocumentBlock, Lightbox, PaletteBlock, ShotListBlock, StoryboardBlock, TypeSpecimenBlock } from "./blocks/Studio";

function Editable({ value, onChange, className, multiline }: { value: string; onChange: (v: string) => void; className?: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return multiline ? (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      rows={Math.max(2, Math.ceil(value.length / 80))}
      className={`w-full resize-y rounded-[10px] border border-transparent bg-transparent p-1 hover:border-border focus:border-border-control focus:outline-none ${className ?? ""}`}
    />
  ) : (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      className={`w-full rounded-[10px] border border-transparent bg-transparent p-1 hover:border-border focus:border-border-control focus:outline-none ${className ?? ""}`}
    />
  );
}

function PlanGraphic({ label, value }: { label: string; value: string }) {
  const kind = label.toLowerCase();
  if (/format|size|frame/.test(kind)) return <div aria-hidden="true" className="flex h-20 items-center justify-center gap-3"><div className="flex h-[72px] w-[44px] flex-col justify-between rounded-[9px] border-2 border-inverse/80 bg-inverse/10 p-1.5"><div className="h-1 w-5 rounded-full bg-inverse/60" /><div className="flex items-end gap-0.5">{[11, 20, 15, 28].map((height, index) => <span key={index} className="w-1.5 rounded-t-sm bg-inverse/60" style={{ height }} />)}</div></div><div className="space-y-1.5"><div className="h-1 w-12 rounded-full bg-inverse/40" /><div className="h-1 w-8 rounded-full bg-inverse/25" /><div className="h-1 w-10 rounded-full bg-inverse/25" /></div></div>;
  if (/duration|length|time/.test(kind)) return <div aria-hidden="true" className="flex h-20 items-center justify-center gap-2"><div className="flex gap-1">{["w-9", "w-12", "w-9"].map((width, index) => <span key={index} className={`${width} flex h-10 items-center justify-center rounded-[8px] border border-inverse/60 bg-inverse/10`}><span className="h-1.5 w-1.5 rounded-full bg-inverse/75" /></span>)}</div><span className="rounded-full border border-inverse/70 px-2 py-1 text-[11px] font-bold tabular-nums">{value.match(/\d+\s*(?:seconds?|secs?|s)\b/i)?.[0] ?? value.slice(0, 8)}</span></div>;
  if (/voice|audio|sound|script/.test(kind)) return <div aria-hidden="true" className="flex h-20 items-center justify-center gap-1">{[14, 25, 38, 21, 48, 30, 17, 35, 23, 12].map((height, index) => <span key={index} className="w-1.5 rounded-full bg-inverse/65" style={{ height }} />)}</div>;
  return <div aria-hidden="true" className="flex h-20 items-center justify-center gap-2">{[0, 1, 2].map((index) => <div key={index} className="relative h-11 w-14 rounded-[9px] border border-inverse/65 bg-inverse/10"><div className="absolute bottom-2 left-2 right-2 h-2 rounded-sm bg-inverse/45" /><div className="absolute left-2 top-2 h-1.5 w-5 rounded-full bg-inverse/55" /></div>)}</div>;
}

type Props = {
  blocks: Block[];
  onChange: (b: Block[]) => void | Promise<void>;
  workspaceId?: string | null;
  canvas?: { id: string; version: number; title?: string } | null;
  onRefresh?: () => void;
  onUseVariants?: ((blockIndex: number, itemIndexes: number[]) => Promise<void>) | undefined;
  onOpenCarousel?: ((plan: CarouselDraft) => void) | undefined;
  tileProductionStarted?: boolean;
  tileReturnedToPlans?: boolean;
  onTileProductionStart?: () => Promise<void>;
};

export function BlockRenderer({ blocks, onChange, workspaceId = null, canvas = null, onRefresh, onUseVariants, onOpenCarousel, tileProductionStarted = false, tileReturnedToPlans = false, onTileProductionStart }: Props) {
  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const tilePlan = useMemo(() => findSocialTilePlan(blocks, canvas?.title), [blocks, canvas?.title]);
  const ids = useMemo(() => tilePlan ? [] : fileIdsIn(blocks), [blocks, tilePlan]);
  const { previews, loading } = usePreviewMap(workspaceId, ids);
  const [box, setBox] = useState<{ ids: string[]; at: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [storyStep, setStoryStep] = useState(0);
  const [preparingVideo, setPreparingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const prepareVideo = useServerFn(prepareStoryboardVideo);
  const toggleVariant = (blockIndex: number, itemIndex: number) => {
    const key = `${blockIndex}:${itemIndex}`;
    setSelected((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const open = useCallback((g: string[], at: string) => setBox({ ids: g, at }), []);
  const conceptIndex = onUseVariants ? blocks.findIndex((block) => block.type === "variants") : -1;
  const carouselIdeas = blocks.flatMap((block) => block.type === "variants"
    ? block.items.filter((item) => isLinkedInCarouselIdea(block.title, item))
    : []);
  const savedCarouselDraft = carouselIdeas.length === 1 && !carouselIdeas[0]?.carousel_plan
    ? blocks.find((block) => block.type === "document" && /^#{1,6}[ \t]+slide[ \t]+1\b/im.test(block.markdown ?? ""))
    : undefined;
  const directIndexes = blocks.flatMap((block, index) => block.type === "direct_video" ? [index] : []);
  const directPhotos = new Set(blocks.flatMap((block) => block.type === "direct_video" ? block.file_ids : []));
  const baseOrder = conceptIndex < 0 ? blocks.map((_, index) => index) : [conceptIndex, ...blocks.map((_, index) => index).filter((index) => index !== conceptIndex)];
  // Keep the real block index for versioned server actions while showing production first.
  const blockOrder = [...directIndexes, ...baseOrder.filter((index) => !directIndexes.includes(index))];
  const storyboardFlow = !!canvas && blocks.some((block) => block.type === "assets") && blocks.some((block) => block.type === "storyboard" || block.type === "shotlist");
  const flowTitles = ["Photos", "Scene order", "Production brief", "Create video"];
  const visibleOrder = storyboardFlow ? blockOrder.filter((index) => {
    const type = blocks[index]?.type;
    if (type === "youtube_gallery" || type === "virlo_research" || type === "virlo_action") return true;
    return storyStep === 0 ? type === "assets" : storyStep === 1 ? type === "storyboard" || type === "shotlist" : storyStep === 2 ? type === "document" || type === "brief" : type === "direct_video";
  }) : blockOrder;
  async function openVideo() {
    if (directIndexes.length) { setStoryStep(3); return; }
    if (!canvas || preparingVideo) return;
    setPreparingVideo(true); setVideoError(null);
    try {
      await prepareVideo({ data: { canvas_id: canvas.id } });
      setStoryStep(3);
      await onRefresh?.();
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : "Video setup could not open.");
    } finally { setPreparingVideo(false); }
  }

  if (tilePlan && canvas && workspaceId) {
    const key = canvasTileRunKey(workspaceId, canvas.id, canvas.version, tilePlan.index);
    return <PostcardTileBatch key={key} compact workspaceId={workspaceId} canvasId={canvas.id} plan={tilePlan.plan} storageKey={key} restoreProduction={tileProductionStarted} returnedToPlans={tileReturnedToPlans} onProductionChange={onRefresh} onProductionStart={onTileProductionStart} />;
  }

  return (
    <StudioCtx.Provider value={{ workspaceId, previews, loading, open }}>
    {box && <Lightbox ids={box.ids} at={box.at} onClose={() => setBox(null)} />}
    <div className="space-y-4">
      {storyboardFlow && <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-border bg-canvas p-2 shadow-sm"><nav aria-label="Video creation steps" className="flex flex-wrap gap-2">
        {flowTitles.map((title, index) => <button key={title} type="button" onClick={() => setStoryStep(index)} aria-current={storyStep === index ? "step" : undefined} className={`rounded-[10px] px-3 py-2 text-[13px] font-semibold ${storyStep === index ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle"}`}>{index + 1}. {title}</button>)}
      </nav><button type="button" disabled={preparingVideo} onClick={() => void openVideo()} className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse disabled:opacity-50">{preparingVideo ? "Opening video options…" : "Create video →"}</button></div>}
      <div className={storyboardFlow ? "max-h-[min(65vh,680px)] space-y-5 overflow-y-auto" : "space-y-8"}>
      {visibleOrder.map((i) => {
        const b = blocks[i];
        if (!b) return null;
        switch (b.type) {
          case "outreach_campaign": return <OutreachBlock key={i} block={b} />;
          case "social_tiles": return <SocialTilesBlock key={i} block={b} workspaceId={workspaceId} />;
          case "virlo_action": return <VirloActionBlock key={i} b={b} workspaceId={workspaceId} />;
          case "virlo_research": return <VirloResearchBlock key={i} b={b} workspaceId={workspaceId} />;
          case "youtube_gallery": return <YouTubeGallery key={i} b={b} workspaceId={workspaceId} onChange={(next) => set(i, next)} />;
          case "direct_video": return canvas ? <div key={i} className="space-y-4">
            {b.status === "options" && !storyboardFlow && b.file_ids.length > 0 && <StoryboardBlock b={{
              type: "storyboard", title: "Storyboard references",
              frames: b.file_ids.map(file_id => ({ at: "", caption: "Reference image", file_id })),
            }} />}
            <DirectVideoBlock b={b} canvas={canvas} index={i} onRefresh={onRefresh} />
          </div> : null;
          case "content_campaign":
            return workspaceId ? <CampaignCard key={i} workspaceId={workspaceId} campaignId={b.campaignId} /> : null;
          case "heading":
            return conceptIndex >= 0 ? null : <Editable key={i} value={b.text} onChange={(v) => set(i, { ...b, text: v })} className="font-display text-[20px] font-bold" />;
          case "text":
            return conceptIndex >= 0 ? <details key={i} className="rounded-[12px] border border-border p-3 text-[13px]"><summary className="cursor-pointer font-semibold">Sam’s fuller explanation</summary><Editable multiline value={b.text} onChange={(v) => set(i, { ...b, text: v })} className="mt-3 text-[13px] leading-relaxed" /></details> : <Editable key={i} multiline value={b.text} onChange={(v) => set(i, { ...b, text: v })} className="text-[15px] leading-relaxed" />;
          case "notice":
            return (
              <div key={i} className={`flex gap-2 rounded-[14px] border p-3 text-[14px] ${b.tone === "warning" ? "border-warning/40 bg-warning-surface text-warning" : "border-border bg-canvas"}`}>
                <AppIcon name={b.tone === "warning" ? "warning" : "check"} size={16} className="mt-0.5" />
                <span>{b.text}</span>
              </div>
            );
          case "brief":
            return (
              <section key={i} aria-label={b.title}>
                <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="font-display text-[17px] font-bold">{b.title}</h3><span className="text-[12px] text-muted-foreground">Edit any card to refine the plan</span></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {b.fields.map((f, k) => (
                    <article key={k} className="relative flex min-h-[185px] flex-col overflow-hidden rounded-[18px] bg-ink p-4 text-inverse">
                      <div className="relative z-10 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.13em] text-inverse/70"><span>{f.label}</span><span>{String(k + 1).padStart(2, "0")} / {String(b.fields.length).padStart(2, "0")}</span></div>
                      <PlanGraphic label={f.label} value={f.value} />
                      <label className="relative z-10 block text-[13px] font-semibold leading-snug"><span className="sr-only">Edit {f.label}</span><Editable multiline value={f.value} onChange={(v) => set(i, { ...b, fields: b.fields.map((x, n) => (n === k ? { ...x, value: v } : x)) })} className="border-inverse/20 bg-inverse/10 text-inverse hover:border-inverse/50 focus:border-inverse" /></label>
                      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full border-[18px] border-inverse/10" aria-hidden="true" />
                    </article>
                  ))}
                </div>
              </section>
            );
          case "variants": {
            const ideas = b.items.map((idea, index) => ({ idea, index, carousel: isLinkedInCarouselIdea(b.title, idea) }));
            const regular = ideas.filter((item) => !item.carousel);
            const editIdea = (index: number, patch: Partial<(typeof b.items)[number]>) =>
              set(i, { ...b, items: b.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
            return (
              <div key={i} className="space-y-6">
                {ideas.filter((item) => item.carousel).map(({ idea, index }) => <CarouselIdeaPlan
                  key={index} idea={idea} workspaceId={workspaceId} onOpen={onOpenCarousel}
                  savedDraft={savedCarouselDraft?.type === "document" ? savedCarouselDraft.markdown : undefined}
                  onPlan={(carousel_plan) => editIdea(index, { carousel_plan })}
                />)}
                {!!regular.length && (onUseVariants ? <ConceptPreview
                  ideas={regular.map(({ idea }) => idea)}
                  selected={new Set(regular.flatMap(({ index }, position) => selected.has(`${i}:${index}`) ? [position] : []))}
                  onToggle={(position) => toggleVariant(i, regular[position]!.index)}
                  onEdit={(position, hook) => void editIdea(regular[position]!.index, { hook })}
                  onUse={(positions) => onUseVariants(i, positions.map((position) => regular[position]!.index))}
                /> : <section>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-[15px] font-bold">{b.title}</h3>
                  <span className="text-[12px] text-muted-foreground">{regular.length} ideas from Sam</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {regular.map(({ idea: v, index: k }) => (
                    <article key={k} className="rounded-[14px] border border-border bg-surface p-4">
                      <div className="flex items-start gap-3">
                        <label className="flex shrink-0 cursor-pointer items-center gap-2" title={`Select hook ${k + 1}`}>
                          <input type="checkbox" checked={selected.has(`${i}:${k}`)} onChange={() => toggleVariant(i, k)} aria-label={`Select hook ${k + 1}: ${v.hook}`} className="h-5 w-5 accent-current" />
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-inverse">{k + 1}</span>
                        </label>
                        <div className="min-w-0 flex-1 space-y-2 text-[14px]">
                          <Editable multiline value={v.hook} onChange={(hook) => void editIdea(k, { hook })} className="font-semibold" />
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{v.angle}{v.format ? ` · ${v.format}` : ""}</p>
                          {v.notes && <p className="text-[13px] text-muted-foreground">{v.notes}</p>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                </section>)}
              </div>
            );
          }
          case "schedule":
            return (
              <section key={i}>
                <h3 className="mb-2 font-display text-[15px] font-bold">{b.title} <span className="text-[12px] font-normal text-muted-foreground">· proposal</span></h3>
                <ul className="divide-y divide-border rounded-[14px] border border-border">
                  {b.items.map((s, k) => (
                    <li key={k} className="grid grid-cols-[160px_140px_1fr] gap-3 px-4 py-2 text-[14px]">
                      <span className="tabular-nums">{s.when}</span><span className="text-muted-foreground">{s.account}</span><span>{s.item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          case "table":
            return (
              <section key={i} className="overflow-x-auto">
                <h3 className="mb-2 font-display text-[15px] font-bold">{b.title}</h3>
                <table className="w-full text-left text-[14px]">
                  <thead><tr className="border-b border-border">{b.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, k) => <tr key={k} className="border-b border-border">{r.map((c, n) => <td key={n} className="px-3 py-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
                </table>
              </section>
            );
          case "assets": return b.file_ids.some((id) => directPhotos.has(id)) ? <details key={i} className="rounded-[12px] border border-border bg-surface p-3"><summary className="cursor-pointer text-[13px] font-semibold">{b.file_ids.length} reference photo{b.file_ids.length === 1 ? "" : "s"} · View gallery</summary><div className="mt-3"><AssetsBlock b={b} /></div></details> : <AssetsBlock key={i} b={b} />;
          case "document":
            if (b === savedCarouselDraft) return null;
            return conceptIndex >= 0 ? <details key={i} className="rounded-[12px] border border-border p-3 text-[13px]"><summary className="cursor-pointer font-semibold">{b.title}</summary><div className="mt-3"><DocumentBlock b={b} /></div></details> : <DocumentBlock key={i} b={b} />;
          case "shotlist": return <ShotListBlock key={i} b={b} onChange={(nb) => set(i, nb)} />;
          case "confirm": return <ConfirmBlock key={i} b={b} index={i} canvas={canvas} onDecided={() => onRefresh?.()} />;
          case "palette": return <PaletteBlock key={i} b={b} />;
          case "type_specimen": return <TypeSpecimenBlock key={i} b={b} />;
          case "storyboard": return <StoryboardBlock key={i} b={b} />;
          case "compare": return <CompareBlock key={i} b={b} />;
          case "checklist":
            return (
              <section key={i}>
                <h3 className="mb-2 font-display text-[15px] font-bold">{b.title}</h3>
                <ul className="space-y-1">
                  {b.items.map((c, k) => (
                    <li key={k}>
                      <label className="flex items-start gap-2 text-[14px]">
                        <input type="checkbox" checked={!!c.done} className="mt-1 accent-[hsl(var(--ink))]"
                          onChange={(e) => set(i, { ...b, items: b.items.map((x, n) => (n === k ? { ...x, done: e.target.checked } : x)) })} />
                        {c.text}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
        }
      })}
      </div>
      {storyboardFlow && <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-canvas p-3 shadow-md">
        <button type="button" disabled={storyStep === 0} onClick={() => setStoryStep((step) => step - 1)} className="rounded-[10px] border border-border-control px-4 py-2 text-[13px] font-semibold disabled:opacity-40">Back</button>
        <span className="text-[12px] text-muted-foreground">{flowTitles[storyStep]}</span>
        {storyStep < 3 ? <button type="button" onClick={() => setStoryStep((step) => step + 1)} className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse">Continue →</button> : directIndexes.length ? <span className="text-[12px] text-muted-foreground">Choose a model above to start production</span> : <button type="button" disabled={preparingVideo} onClick={() => void openVideo()} className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse disabled:opacity-50">{preparingVideo ? "Opening video options…" : "Create video →"}</button>}
      </div>}
      {videoError && <p role="alert" className="text-[13px] text-destructive">{videoError}</p>}
    </div>
    </StudioCtx.Provider>
  );
}
