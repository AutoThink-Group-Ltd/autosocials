import { useScheduleDialog } from "@/features/schedule/ScheduleDialogHost";
import { channelStatusLabel, useAssetPublishingStatus, type AssetChannelStatus } from "@/features/schedule/useAssetPublishingStatus";

type ScheduleSelection = { tileIds?: string[]; videoIds?: string[]; writtenIds?: string[]; knownPreviouslyPublished?: boolean };
const visibleStatus = (status: AssetChannelStatus) => ["published", "pending", "publishing", "retrying", "awaiting_approval"].includes(status.status);

/** The shared scheduling host refreshes history and confirms any repost before adding. */
export function useSafeScheduleAdd(workspaceId: string, scope: ScheduleSelection, _names: Record<string, string> = {}) {
  const { addToSchedule } = useScheduleDialog();
  const history = useAssetPublishingStatus(workspaceId, scope.tileIds ?? [], scope.videoIds ?? [], scope.writtenIds ?? []);
  const add = async (selection: ScheduleSelection) => { addToSchedule(selection); };
  return { add, history, confirmation: null };
}

export function PublishingHistory({ statuses }: { statuses: AssetChannelStatus[] }) {
  const visible = statuses.filter(visibleStatus);
  if (!visible.length) return null;
  return <div className="space-y-1" aria-label="Publishing history">{visible.map((status, index) => <p key={`${status.accountId}-${index}`} className="text-xs font-semibold text-muted-foreground">{channelStatusLabel(status)}</p>)}</div>;
}
