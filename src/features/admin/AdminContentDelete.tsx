import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { enqueueAdminContentDeletions, processAdminContentDeletions } from "@/lib/admin-content-delete.functions";

export type DeletableContent = { target: string; workspaceId: string; label: string };
export function useAdminContentDelete(kind: "video" | "tile") {
  const enqueue = useServerFn(enqueueAdminContentDeletions);
  const process = useServerFn(processAdminContentDeletions);
  const client = useQueryClient();
  const [selected, setSelected] = useState<DeletableContent[]>([]);
  const [confirm, setConfirm] = useState<DeletableContent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = (x: DeletableContent) => `${x.workspaceId}:${x.target}`;
  const isSelected = (x: DeletableContent) => selected.some(item => key(item) === key(x));
  const toggle = (x: DeletableContent) => setSelected(old => old.some(item => key(item) === key(x)) ? old.filter(item => key(item) !== key(x)) : [...old, x]);
  const selectPage = (items: DeletableContent[]) => setSelected(old => {
    const all = items.every(item => old.some(value => key(item) === key(value)));
    const visible = new Set(items.map(key));
    return all ? old.filter(item => !visible.has(key(item))) : [...old, ...items.filter(item => !old.some(value => key(item) === key(value)))];
  });
  async function run(items?: DeletableContent[]) {
    setBusy(true); setMessage("");
    try {
      const rejected: { target: string; workspaceId: string; error?: string }[] = [];
      if (items) {
        for (let offset = 0; offset < items.length; offset += 50) {
          const outcome = await enqueue({ data: { confirmed: true, items: items.slice(offset, offset + 50).map(({ workspaceId, target }) => ({ kind, workspaceId, target })) } });
          rejected.push(...outcome.filter(item => item.error));
        }
        setSelected(old => old.filter(item => !items.some(chosen => key(chosen) === key(item)) || rejected.some(failed => failed.target === item.target && failed.workspaceId === item.workspaceId)));
      }
      const result = await process({ data: { kind } });
      await client.invalidateQueries({ queryKey: [kind === "video" ? "admin-content-library" : "admin-social-tiles"] });
      setMessage(`${result.completed} permanently deleted.${result.pending ? ` ${result.pending} pending; use Retry pending deletions.` : ""}${rejected.length ? ` ${rejected.length} not queued: ${rejected.map(x => x.error).join("; ")}` : ""}`);
      setConfirm(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Deletion could not be completed. Retry pending deletions."); setConfirm(null); }
    finally { setBusy(false); }
  }
  const toolbar = (items: DeletableContent[]) => <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={!items.length || busy} onClick={() => selectPage(items)}>{items.length && items.every(isSelected) ? "Clear page selection" : "Select page"}</Button><Button size="sm" variant="destructive" disabled={!selected.length || busy} onClick={() => setConfirm(selected)}>{`Delete selected (${selected.length})`}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>Retry pending deletions</Button></div>;
  const dialog = <><AlertDialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete {confirm?.length === 1 ? "this asset" : `${confirm?.length ?? 0} assets`}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the saved file and its library record across the workspace. This cannot be undone. Assets used by posts or shared with other files are protected. Failed deletions remain pending for retry.</AlertDialogDescription></AlertDialogHeader>{confirm?.length === 1 && <p className="break-words text-sm font-semibold">{confirm[0]?.label}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (confirm) void run(confirm); }}>{busy ? "Deleting…" : "Permanently delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</>;
  return { isSelected, toggle, toolbar, dialog, deleteOne: (item: DeletableContent) => setConfirm([item]) };
}
