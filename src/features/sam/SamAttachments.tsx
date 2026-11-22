import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { startUpload } from "@/workspace/uploads/uploadStore";

type Attachment = { key: string; name: string; preview: string; file: File; status: "uploading" | "saved" | "error"; fileId?: string; error?: string | undefined };
export const MAX_SAM_ATTACHMENTS = 20;

/** Draft references are separate from saved Brand Assets. Removing a draft never deletes a file. */
export function useSamAttachments(workspaceId: string | undefined, threadId: string | null, stage: string) {
  const qc = useQueryClient();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const epoch = useRef(0);
  const scope = `${workspaceId ?? ""}:${threadId ?? ""}:${stage}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const update = (next: Attachment[]) => { current.current = next; setAttachments(next); };
  function clear() {
    epoch.current++;
    current.current.forEach((item) => URL.revokeObjectURL(item.preview));
    update([]);
  }
  useEffect(() => {
    clear();
    return () => { epoch.current++; current.current.forEach((item) => URL.revokeObjectURL(item.preview)); current.current = []; };
  // Only the draft's owning workspace/chat/stage may receive an async upload result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function upload(items: Attachment[]) {
    if (!workspaceId) return;
    const owner = scopeRef.current;
    const version = epoch.current;
    const result = await startUpload(workspaceId, items.map((item) => item.file));
    await Promise.all(["brand-files", "brand-context", "asset-folders"].map((key) => qc.invalidateQueries({ queryKey: [key, workspaceId] })));
    if (scopeRef.current !== owner || epoch.current !== version) return;
    const outcomes = new Map(items.map((item, index) => [item.key, result.files[index]]));
    update(current.current.map<Attachment>((item) => {
      if (!outcomes.has(item.key)) return item;
      const outcome = outcomes.get(item.key);
      return outcome?.fileId ? { ...item, status: "saved", fileId: outcome.fileId, error: undefined } : { ...item, status: "error", error: outcome?.error ?? result.errors[0] ?? "This photo could not be saved. Try again." };
    }));
  }
  function addFiles(files: File[]) {
    if (!workspaceId) { toast.error("Choose a business before attaching photos."); return; }
    const images = files.filter((file) => /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name));
    if (images.length !== files.length) toast.error("Attach JPG, PNG, WebP, GIF or AVIF photos here.");
    if (images.length + current.current.length > MAX_SAM_ATTACHMENTS) { toast.error(`Attach up to ${MAX_SAM_ATTACHMENTS} photos to one message.`); return; }
    const items: Attachment[] = images.map((file) => ({ key: crypto.randomUUID(), name: file.name, preview: URL.createObjectURL(file), file, status: "uploading" }));
    update([...current.current, ...items]);
    if (items.length) void upload(items);
  }
  function remove(key: string) {
    const item = current.current.find((candidate) => candidate.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    update(current.current.filter((candidate) => candidate.key !== key));
  }
  function retry(key: string) {
    const item = current.current.find((candidate) => candidate.key === key);
    if (!item || item.status !== "error") return;
    update(current.current.map((candidate) => candidate.key === key ? { ...candidate, status: "uploading", error: undefined } : candidate));
    void upload([item]);
  }
  return { attachments, addFiles, remove, retry, clear, blocked: attachments.some((item) => item.status !== "saved"), ids: [...new Set(attachments.flatMap((item) => item.status === "saved" && item.fileId ? [item.fileId] : []))] };
}

export function SamAttachmentGrid({ attachments, remove, retry }: Pick<ReturnType<typeof useSamAttachments>, "attachments" | "remove" | "retry">) {
  if (!attachments.length) return null;
  return <div className="mb-3 space-y-2">
    <div className="flex items-center justify-between gap-2 text-[12px]"><span className="font-medium">{attachments.length} reference photos</span><a href="/app/brand-assets" className="text-muted-foreground underline">Brand Assets</a></div>
    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
      {attachments.map((item) => <div key={item.key} className="relative overflow-hidden rounded-[10px] border border-border bg-surface">
        <img src={item.preview} alt={item.name} className="aspect-square w-full object-cover" />
        <button type="button" onClick={() => remove(item.key)} title="Remove from message; keep saved asset" aria-label={`Remove ${item.name} from message`} className="absolute right-1 top-1 rounded-full border border-border bg-canvas p-1"><X size={13} /></button>
        <div className="p-1.5 text-[10px]"><p className="truncate" title={item.name}>{item.name}</p><p role="status" className="mt-0.5 flex items-center gap-1 text-muted-foreground">{item.status === "uploading" ? <><Loader2 size={11} className="animate-spin" />Saving…</> : item.status === "saved" ? "Saved to Brand Assets" : "Upload failed"}</p>
          {item.status === "error" && <><p className="mt-1 text-destructive">{item.error}</p><button type="button" onClick={() => retry(item.key)} className="mt-1 underline">Retry photo</button></>}
        </div>
      </div>)}
    </div>
    <p className="text-[11px] text-muted-foreground">Photos are saved privately in Brand Assets. Removing a photo here only removes it from this message.</p>
  </div>;
}

export function SamAttachButton({ addFiles, disabled }: { addFiles: (files: File[]) => void; disabled: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  return <><input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple className="hidden" onChange={(event) => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /><button type="button" disabled={disabled} onClick={() => picker.current?.click()} aria-label="Attach reference photos" title="Attach reference photos" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border-control hover:bg-surface-subtle disabled:opacity-40"><ImagePlus size={17} /></button></>;
}
