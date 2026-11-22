import { useState } from "react";
import { Plus, X } from "lucide-react";
import { StudioCtx, usePreviewMap } from "@/workspace/live-view/blocks/usePreviews";
import { FileTile, Lightbox, SwapPicker } from "@/workspace/live-view/blocks/Studio";
import { MAX_FILES_PER_ASSET } from "@/lib/wizard";

/** The brand files Sam hand-picked for one asset: preview, remove, add from the library. */
export function BriefFiles({ ws, ids, disabled, onChange }: { ws: string; ids: string[]; disabled?: boolean; onChange: (ids: string[]) => void }) {
  const { previews, loading } = usePreviewMap(ws, ids);
  const [box, setBox] = useState<{ ids: string[]; at: string } | null>(null);
  const [picking, setPicking] = useState(false);
  return (
    <StudioCtx.Provider value={{ workspaceId: ws, previews, loading, open: (g, at) => setBox({ ids: g, at }) }}>
      <div className="border-b border-border px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brand files Sam will use</p>
        <ul className="flex flex-wrap gap-3">
          {ids.map((id) => (
            <li key={id} className="relative w-24">
              <FileTile id={id} group={ids} caption={<span />} />
              <button type="button" aria-label="Remove file" disabled={disabled} onClick={() => onChange(ids.filter((x) => x !== id))}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-canvas hover:bg-surface-subtle"><X className="h-3 w-3" /></button>
            </li>
          ))}
          {ids.length < MAX_FILES_PER_ASSET && (
            <li><button type="button" disabled={disabled} onClick={() => setPicking(true)}
              className="grid aspect-square w-24 place-items-center rounded-[14px] border-2 border-dashed border-ink text-[12px] font-medium hover:bg-surface-subtle">
              <span className="flex flex-col items-center gap-1"><Plus className="h-4 w-4" />Add file</span>
            </button></li>
          )}
        </ul>
        {!ids.length && <p className="mt-2 text-[12px] text-muted-foreground">No brand files picked — Sam will use type and motion only. Add some to put your logo or products in.</p>}
      </div>
      {picking && <SwapPicker onClose={() => setPicking(false)} onPick={(id) => { setPicking(false); if (!ids.includes(id)) onChange([...ids, id]); }} />}
      {box && <Lightbox ids={box.ids} at={box.at} onClose={() => setBox(null)} />}
    </StudioCtx.Provider>
  );
}
