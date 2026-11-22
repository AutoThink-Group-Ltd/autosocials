import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { listLinkedInCarousels } from "@/lib/linkedin-carousel.functions";
import { useCarouselTrash } from "./use-carousel-trash";

export function CarouselLibrary({ workspaceId }: { workspaceId: string }) {
  const list = useServerFn(listLinkedInCarousels);
  const trash = useCarouselTrash(workspaceId);
  const decks = useQuery({
    queryKey: ["linkedin-carousels", workspaceId],
    queryFn: () => list({ data: { workspace_id: workspaceId } }),
  });
  const visible = trash.isLoading || trash.isError ? [] : (decks.data ?? []).filter(deck => !trash.includes(deck.id));
  return <section className="space-y-4">
    <h2 className="font-display text-xl font-bold">LinkedIn Carousels</h2>
    {(decks.isPending || trash.isLoading) && <p role="status">Loading carousels…</p>}
    {decks.isError && <p role="alert">Your carousels could not be loaded. <button type="button" className="underline" onClick={() => void decks.refetch()}>Try again</button></p>}
    {trash.isError && <p role="alert">Could not check Deleted Items. <button type="button" className="underline" onClick={() => void trash.retry()}>Try again</button></p>}
    {decks.data && !trash.isLoading && !trash.isError && visible.length === 0 && <p className="text-sm text-muted-foreground">Your saved carousels will appear here. <Link className="font-semibold underline" to="/app/create" search={{ carousel: "new" }}>Create a carousel</Link></p>}
    <ul className="divide-y divide-border">{visible.map(deck => <li key={deck.id}>
      <Link to="/app/create" search={{ carousel: deck.id }} className="flex items-center justify-between gap-4 rounded-lg p-3 font-semibold hover:bg-surface-subtle">
        {deck.title}<ChevronRight aria-hidden className="size-4 shrink-0" />
      </Link>
    </li>)}</ul>
  </section>;
}
