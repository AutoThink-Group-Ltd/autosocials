import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CarouselStoryboard } from "@/features/create/CarouselStoryboard";
import { getLinkedInCarousel } from "@/lib/linkedin-carousel.functions";

function ScheduleCarouselPreview({ workspaceId, carouselId }: { workspaceId: string; carouselId: string }) {
  const [active, setActive] = useState(0);
  const getCarousel = useServerFn(getLinkedInCarousel);
  const deck = useQuery({
    queryKey: ["schedule-carousel-preview", workspaceId, carouselId],
    queryFn: () => getCarousel({ data: { workspace_id: workspaceId, id: carouselId } }),
  });

  if (deck.isPending) return <p role="status" className="py-6 text-center text-sm">Loading carousel slides…</p>;
  if (!deck.data) return <div role="alert" className="space-y-3 py-6 text-center text-sm">
    <p>Could not load the carousel slides.</p>
    <Button type="button" variant="outline" size="sm" onClick={() => void deck.refetch()}>Try again</Button>
  </div>;

  return <CarouselStoryboard plan={deck.data.plan} images={deck.data.slides} active={active} onSelect={setActive} squareFrame />;
}

export function ScheduleCarouselPreviewDialog({ workspaceId, carouselId, title, onClose }: {
  workspaceId: string;
  carouselId: string;
  title: string;
  onClose: () => void;
}) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto">
      <DialogTitle className="pr-6">{title}</DialogTitle>
      <DialogDescription className="sr-only">Browse the finished carousel slides.</DialogDescription>
      <ScheduleCarouselPreview key={carouselId} workspaceId={workspaceId} carouselId={carouselId} />
    </DialogContent>
  </Dialog>;
}
