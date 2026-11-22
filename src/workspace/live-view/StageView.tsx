import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MODULES, type ModuleId } from "@/brand/tokens";
import { AppIcon } from "@/components/brand/AppIcon";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useWorkspaceUiOptional, type ActiveCanvas } from "@/workspace/WorkspaceUi";
import { parseBlocks, type Block } from "@/lib/sam.blocks";
import { isLinkedInCarouselIdea, type CarouselDraft, type CarouselPlan } from "@/lib/linkedin-carousel";
import { fetchAll } from "@/lib/fetch-all";
import type { Narrative } from "@/lib/wizard";
import { cn } from "@/lib/utils";
import { BlockRenderer } from "./BlockRenderer";

type CanvasRow = { id: string; title: string; blocks: unknown; version: number; pinned: boolean; updated_at: string; updated_by: string | null };
const CarouselEditor = lazy(() => import("@/features/create/LinkedInCarousels").then((module) => ({ default: module.LinkedInCarousels })));

/** Live View for one stage: fixed default tab + persistent canvas tabs. */
export function StageView({ module, children }: { module: ModuleId; children: ReactNode }) {
  const mod = MODULES.find((m) => m.id === module)!;
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const ui = useWorkspaceUiOptional();
  const [localCanvas, setLocalCanvas] = useState<ActiveCanvas>(null);
  const activeCanvas = ui ? ui.activeCanvas : localCanvas;
  const setActiveCanvas = ui ? ui.setActiveCanvas : setLocalCanvas;
  const qc = useQueryClient();
  const [present, setPresent] = useState(false);
  const [carouselEditor, setCarouselEditor] = useState<{ canvasId: string; plan: CarouselPlan } | null>(null);
  const activeCanvasId = useRef(activeCanvas?.id ?? null);

  const { data: canvases = [] } = useQuery({
    queryKey: ["canvases", wsId, module],
    enabled: !!wsId,
    queryFn: async (): Promise<CanvasRow[]> => {
      const { data } = await supabase.from("canvases").select("id,title,blocks,version,pinned,updated_at,updated_by")
        .eq("workspace_id", wsId!).eq("module", module).eq("archived", false)
        .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });

  // Restore last tab per module; drop selection that belongs to another module.
  useEffect(() => {
    const key = `as.tab.${wsId}.${module}`;
    if (activeCanvas && !canvases.some((c) => c.id === activeCanvas.id) && canvases.length) {
      setActiveCanvas(null);
    }
    if (!activeCanvas) {
      const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      const c = canvases.find((x) => x.id === saved);
      if (c) setActiveCanvas({ id: c.id, version: c.version, title: c.title });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvases, module, wsId]);

  useEffect(() => {
    activeCanvasId.current = activeCanvas?.id ?? null;
    localStorage.setItem(`as.tab.${wsId}.${module}`, activeCanvas?.id ?? "");
  }, [activeCanvas, module, wsId]);

  const current = canvases.find((c) => c.id === activeCanvas?.id);
  const blocks = parseBlocks(current?.blocks);
  const hasCarousel = module === "create" && blocks.some((block) =>
    block.type === "variants" && block.items.some((item) => isLinkedInCarouselIdea(block.title, item)),
  );
  const presenting = present && !hasCarousel;

  function openCarousel(plan: CarouselDraft) {
    if (!current || !wsId) return;
    setPresent(false);
    setCarouselEditor({
      canvasId: current.id,
      plan: { ...plan, slides: plan.slides.map((slide) => ({ ...slide, id: crypto.randomUUID() })) },
    });
  }

  function changeCanvas(next: ActiveCanvas) {
    activeCanvasId.current = next?.id ?? null;
    setCarouselEditor(null);
    setActiveCanvas(next);
  }

  async function save(blocks: Block[]) {
    if (!current || !wsId) return;
    const { data, error } = await supabase.from("canvases")
      .update({ blocks: blocks as never, version: current.version + 1, updated_by: "user", updated_at: new Date().toISOString() })
      .eq("id", current.id).eq("workspace_id", wsId).eq("archived", false).eq("version", current.version).select("id,version,title");
    if (error || !data?.length) { toast.error("This canvas changed elsewhere. Reloaded the latest version."); }
    else if (activeCanvasId.current === current.id) setActiveCanvas(data[0]!);
    await qc.invalidateQueries({ queryKey: ["canvases", wsId, module] });
  }

  async function archive(id: string) {
    await supabase.from("canvases").update({ archived: true }).eq("id", id);
    if (activeCanvas?.id === id) setActiveCanvas(null);
    await qc.invalidateQueries({ queryKey: ["canvases", wsId, module] });
  }

  async function useCanvasHooks(blockIndex: number, itemIndexes: number[]) {
    if (!current || !wsId || module !== "create") return;
    const block = blocks[blockIndex];
    if (block?.type !== "variants" || !itemIndexes.length || itemIndexes.some((index) => {
      const item = block.items[index];
      return !item || isLinkedInCarouselIdea(block.title, item);
    })) return;
    try {
      const { data: message, error: messageError } = await supabase.from("agent_messages").select("thread_id")
        .eq("workspace_id", wsId).eq("canvas_id", current.id).eq("role", "assistant")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (messageError || !message) throw new Error("Sam's source chat could not be found.");
      const batches = await fetchAll<{ id: string; narratives: unknown }>(async (from, to) => {
        const { data, error } = await supabase.from("creative_batches").select("id,narratives")
          .eq("workspace_id", wsId).eq("goal", `sam-thread:${message.thread_id}`).range(from, to);
        return { data, error };
      });
      const available = batches.flatMap((batch) => (Array.isArray(batch.narratives) ? batch.narratives as Narrative[] : [])
        .filter((idea) => idea.id && idea.libraryStatus !== "binned" && idea.libraryStatus !== "rejected")
        .map((idea) => ({ id: `${batch.id}:${idea.id}`, title: idea.title })));
      const chosen = itemIndexes.map((index) => {
        const hook = block.items[index]?.hook.replace(/\s+/g, " ").trim().slice(0, 160);
        return available.find((idea) => idea.title === hook)?.id;
      });
      if (chosen.some((id) => !id)) throw new Error("One of these hooks changed after Sam saved it. Ask Sam to save the revised hook before using it.");
      const key = `as:selected-narratives:${wsId}`;
      let previous: string[] = [];
      try { previous = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[]; } catch { /* Start a fresh selection. */ }
      sessionStorage.setItem(key, JSON.stringify([...new Set([...previous, ...chosen as string[]])]));
      sessionStorage.setItem(`as:canvas-hook-selection:${wsId}`, "1");
      await qc.invalidateQueries({ queryKey: ["narrative-library", wsId] });
      setActiveCanvas(null);
      toast.success(`${chosen.length} hook${chosen.length === 1 ? "" : "s"} selected. Review them in Create, then choose Generate videos.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't select those hooks"); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canvases.length > 0 && (
        <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2" role="tablist">
          <button role="tab" aria-selected={!current} onClick={() => changeCanvas(null)}
            className={cn("flex h-8 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium",
              !current ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle")}>
            <AppIcon name={module} size={16} /> {mod.surface}
          </button>
          {canvases.map((c) => (
            <div key={c.id} className={cn("group flex h-8 shrink-0 items-center rounded-[10px] text-[13px]",
              current?.id === c.id ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle")}>
            <button role="tab" aria-selected={current?.id === c.id}
              onClick={() => { if (c.id !== current?.id) changeCanvas({ id: c.id, version: c.version, title: c.title }); }}
              className="max-w-[180px] truncate pl-3 pr-1">{c.title}</button>
            <button aria-label={`Close ${c.title}`} onClick={() => void archive(c.id)} className="px-2 opacity-60 hover:opacity-100">
              <AppIcon name="close" size={14} />
            </button>
            </div>
          ))}
        </div>
      )}
      <div className={cn("min-h-0 flex-1", module === "create" && !current ? "overflow-hidden" : "overflow-y-auto p-4 md:p-6")}>
        {current && wsId && carouselEditor?.canvasId === current.id ? (
          <Suspense fallback={<p role="status" className="p-6">Opening carousel editor…</p>}>
            <CarouselEditor workspaceId={wsId} initialPlan={carouselEditor.plan} onBack={() => setCarouselEditor(null)} />
          </Suspense>
        ) : current ? (
          <div className={cn("mx-auto max-w-5xl", presenting && "fixed inset-0 z-40 max-w-none overflow-y-auto bg-canvas px-6 py-10 md:px-16")}>
            <div className={cn("sticky top-0 z-10 -mx-1 mb-6 flex items-center justify-between gap-3 bg-canvas/85 px-1 py-2 backdrop-blur", presenting && "mx-auto max-w-5xl")}>
              <div className="min-w-0"><h2 className="truncate font-display text-[20px] font-bold tracking-tight">{current.title}</h2>
                <p className="text-[12px] text-muted-foreground">Version {current.version} · {current.updated_by === "sam" ? "by Sam" : "edited by you"} · saves automatically</p></div>
              {!hasCarousel && <button type="button" onClick={() => setPresent(!present)} className="shrink-0 rounded-[10px] border border-border-control px-3 py-1.5 text-[13px] font-medium hover:bg-surface-subtle">{presenting ? "Exit presentation" : "Present"}</button>}
            </div>
            <div className={cn(presenting && "mx-auto max-w-5xl")}>
              <BlockRenderer key={current.id} blocks={blocks} onChange={save}
                workspaceId={wsId ?? null} canvas={{ id: current.id, version: current.version, title: current.title }}
                onUseVariants={module === "create" ? useCanvasHooks : undefined}
                onOpenCarousel={hasCarousel ? openCarousel : undefined}
                onRefresh={async () => {
                  await qc.invalidateQueries({ queryKey: ["canvases", wsId, module] });
                  await qc.invalidateQueries({ queryKey: ["sam-messages", wsId, module] });
                  const { data } = await supabase.from("canvases").select("id,version,title").eq("id", current.id).single();
                  if (data) setActiveCanvas(data);
                }} />
            </div>
          </div>
        ) : children}
      </div>
    </div>
  );
}

export function StageEmpty({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="font-display text-[24px] font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      {note && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-[10px] border border-border bg-canvas px-3 py-2 text-[13px]">
          <AppIcon name="warning" size={14} /> {note}
        </p>
      )}
    </div>
  );
}
