import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { stopSamIdeation } from "@/lib/creative.functions";

export function StopSamButton({ workspaceId, background = false, stopChat }: { workspaceId: string | undefined; background?: boolean; stopChat?: (() => void | Promise<void>) | undefined }) {
  const cancel = useServerFn(stopSamIdeation);
  const qc = useQueryClient();
  const [stopping, setStopping] = useState(false);
  async function stop() {
    if (stopping) return;
    setStopping(true);
    try {
      await stopChat?.();
      if (background && workspaceId) {
        await cancel({ data: { workspace_id: workspaceId } });
        window.dispatchEvent(new CustomEvent("as:sam-ideation-stopped", { detail: { workspaceId } }));
        window.dispatchEvent(new CustomEvent("as:sam-ideation", { detail: { workspaceId, active: false } }));
        await Promise.all(["sam-messages", "create-ideation", "narrative-library", "batches"].map((key) => qc.invalidateQueries({ queryKey: [key, workspaceId] })));
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sam could not be stopped. Please try again."); }
    finally { setStopping(false); }
  }
  return <button type="button" onClick={() => void stop()} disabled={stopping} className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-border-control bg-canvas px-3 py-2 text-[12px] font-semibold text-ink hover:bg-surface-subtle disabled:opacity-50"><span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-current" />{stopping ? "Stopping…" : "Stop Sam"}</button>;
}
