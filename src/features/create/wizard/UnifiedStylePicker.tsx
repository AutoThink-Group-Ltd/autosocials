import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVideoModelOptions } from "@/lib/creative.functions";
import { CONTENT_RECIPES } from "@/lib/content-recipes";
import { ContentRecipeCards } from "./ContentRecipeCards";

export const TILE_STYLES = [
  { id: "editorial", name: "Brand editorial", direction: "Brand-guided editorial design with clean layout" },
  { id: "typography", name: "Bold typography", direction: "Typography-led poster with a strong readable headline" },
  { id: "illustration", name: "Illustrated", direction: "Illustrated artwork with expressive brand-guided graphics" },
] as const;
export type UnifiedStyle = { kind: "video"; id: string; name: string } | { kind: "tile"; id: string; name: string; direction: string };

export function UnifiedStylePicker({ ws, onChoose }: { ws: string; onChoose: (style: UnifiedStyle) => void }) {
  const getModels = useServerFn(getVideoModelOptions);
  const models = useQuery({ queryKey: ["video-model-options", ws], queryFn: () => getModels({ data: { workspace_id: ws } }) });
  return <section aria-label="Choose a content style" className="space-y-5">
    <div><h2 className="font-display text-2xl font-bold">Choose a style</h2><p className="mt-1 text-sm text-muted-foreground">Choose a video or social tile style. Sam checks pricing before creation.</p></div>
    <h3 className="font-display text-xl font-bold">Video styles</h3>
    {models.isPending && <p role="status">Checking available video styles…</p>}
    {models.isError && <p role="alert">Video styles could not be loaded. <button type="button" className="underline" onClick={() => void models.refetch()}>Try again</button></p>}
    {models.data && <ContentRecipeCards available={(style) => models.data?.some((model) => model.id === style && model.availability !== "unavailable") ?? false} onChoose={(id) => { const recipe = CONTENT_RECIPES.find((item) => item.id === id)!; onChoose({ kind: "video", id: recipe.styleId, name: recipe.name }); }} />}
    <h3 className="font-display text-xl font-bold">Social tile styles</h3>
    <div className="grid gap-3 md:grid-cols-3">{TILE_STYLES.map((style) => <button key={style.id} type="button" className="rounded-xl border border-border-control bg-surface p-5 text-left hover:bg-surface-subtle" onClick={() => onChoose({ kind: "tile", ...style })}><span className="block font-display text-xl font-bold">{style.name}</span><span className="mt-2 block text-sm text-muted-foreground">{style.direction}</span></button>)}</div>
  </section>;
}
