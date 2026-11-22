import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { TileFeedPreview } from "./TileFeedPreview";
import type { AssetChannelStatus } from "./useAssetPublishingStatus";

export type ScheduleTile = { id: string; title: string; url?: string | undefined; savedCaption?: { caption: string; platform: string } | undefined };

export function ScheduleTilePreview({ workspaceId, tile, publishingHistory, onClose }: { workspaceId: string; tile: ScheduleTile; publishingHistory?: AssetChannelStatus[] | undefined; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl">
      <DialogTitle className="pr-6">{tile.title}</DialogTitle>
      <DialogDescription>See how your tile looks and check where it was published.</DialogDescription>
      <TileFeedPreview key={tile.id} workspaceId={workspaceId} tileId={tile.id} title={tile.title} imageUrl={tile.url} savedCaption={tile.savedCaption} publishingHistory={publishingHistory} />
    </DialogContent>
  </Dialog>;
}
