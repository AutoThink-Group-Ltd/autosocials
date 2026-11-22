import { Film, Pencil } from "lucide-react";
import { usePreviewMap } from "@/workspace/live-view/blocks/usePreviews";
import type { FilePreview } from "@/lib/studio.functions";
import { readStoryboardSections, readStoryboardVoiceover } from "@/lib/build-prompt";
import { cn } from "@/lib/utils";
import { type Variant } from "./shared";

type StoryScene = { name: string; time: string; copy: string[]; action: string; fileIds: string[]; voiceover?: string[] };
/** Read the copy directly from the saved storyboard that Production uses. */
export function storyboardScenesOf(v: Variant): StoryScene[] {
  const beats = Array.isArray(v.beats) ? v.beats.filter((beat): beat is string => typeof beat === "string" && !!beat.trim()) : [];
  const voiceover = readStoryboardVoiceover(v.build_prompt, v.voiceover ?? "");
  const scenes = readStoryboardSections(v.build_prompt).map((scene) => ({
    name: scene.name,
    time: `${scene.start}-${scene.end}s`,
    copy: scene.copy,
    action: scene.action,
    voiceover: voiceover.filter(line => line.start >= scene.start && line.start < scene.end).map(line => line.copy),
    fileIds: (v.file_ids ?? []).filter((id) => scene.files.includes(id)),
  }));
  if (scenes.length) return scenes;
  return (beats.length ? beats : [v.opening_visual || v.hook || "Your opening scene"]).map((beat, i, all) => ({
    name: i === 0 ? "The opening" : i === all.length - 1 ? "The close" : `Scene ${i + 1}`,
    time: beat.match(/^\s*([\d.]+\s*[–-]\s*[\d.]+s)/)?.[1] ?? `Scene ${i + 1}`,
    copy: [...beat.matchAll(/[‘“]([^’”]+)[’”]/g)].map((match) => match[1]!).slice(0, 3),
    action: beat.replace(/^\s*[\d.]+\s*[–-]\s*[\d.]+s\s*:\s*/, ""), fileIds: [],
  }));
}

const visualFile = (file: FilePreview) => file.kind === "image" || file.kind === "logo" || file.kind === "video";

export function VisualStoryboard({ ws, v, onEdit }: { ws: string; v: Variant; onEdit: (sceneIndex: number) => void }) {
  const scenes = storyboardScenesOf(v);
  const { previews } = usePreviewMap(ws, v.file_ids ?? []);
  const size = /^(\d+)x(\d+)$/.exec(v.size);
  const aspectRatio = size ? `${size[1]} / ${size[2]}` : "16 / 9";

  return (
    <section aria-label="Visual storyboard" className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <ol aria-label="Storyboard scenes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {scenes.map((scene, index) => {
          const shot = scene.fileIds.map((id) => previews.get(id)).find((file) => file && visualFile(file));
          const poster = shot?.kind === "video" ? shot.thumbnail : shot?.url;
          return <li key={index} className="min-w-0 space-y-2">
            <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
              <strong>Scene {index + 1}</strong>
              <span className="ml-auto tabular-nums text-muted-foreground">{scene.time}</span>
              <button type="button" aria-label={`Edit scene ${index + 1}`} onClick={() => onEdit(index)} className="rounded-md p-2 hover:bg-surface-subtle"><Pencil className="size-4" /></button>
            </div>
            <div style={{ aspectRatio }} className="relative isolate flex min-h-0 flex-col justify-end overflow-auto rounded-xl border border-border-control bg-surface-subtle">
              {poster ? <img src={poster} alt={shot?.name ?? ""} className={cn("absolute inset-0 -z-10 h-full w-full", shot?.kind === "logo" ? "object-contain p-6" : "object-cover")} /> : <div className="absolute inset-0 -z-10 grid place-items-center" aria-hidden="true"><Film className="size-12 text-muted-foreground/25" /></div>}
              {scene.copy.length > 0 && <div className={cn("mt-auto space-y-1 p-3", poster && "bg-ink/80 text-inverse")}>
                {scene.copy.map((line, i) => <p key={i} className="whitespace-pre-wrap break-words font-display text-base font-bold leading-tight">{line}</p>)}
              </div>}
            </div>
            {!!scene.voiceover?.length && <p className="whitespace-pre-wrap text-sm"><span className="sr-only">Voiceover: </span>{scene.voiceover.join(" ")}</p>}
            {scene.action && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{scene.action}</p>}
          </li>;
        })}
      </ol>
      {v.voiceover && !scenes.some(scene => scene.voiceover?.length) && <details className="rounded-xl border border-border-control px-3 py-2 text-sm">
        <summary className="cursor-pointer font-semibold">Voiceover</summary>
        <p className="mt-2 whitespace-pre-wrap">{v.voiceover}</p>
      </details>}
    </section>
  );
}
