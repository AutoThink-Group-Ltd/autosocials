import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceCreationScheduleDialog } from "./WorkspaceCreationScheduleDialog";
import type { CampaignScheduleRow } from "./CreationScheduleDialog";

export function CampaignScheduleReview({workspaceId, rows}: {workspaceId: string; timezone: string; rows: CampaignScheduleRow[]}) {
  const [page, setPage] = useState<number | null>(null);
  if (!rows.length) return null;
  const groups = Array.from({length: Math.ceil(rows.length / 20)}, (_, index) => rows.slice(index * 20, (index + 1) * 20));
  return <>
    {groups.map((group, index) => <Button key={group[0]!.postId} type="button" onClick={() => setPage(index)}>
      Review schedule{groups.length > 1 ? ` · posts ${index * 20 + 1}–${index * 20 + group.length}` : ""}
    </Button>)}
    {page !== null && groups[page] && <WorkspaceCreationScheduleDialog open workspaceId={workspaceId}
      campaignRows={groups[page]} initialTileIds={groups[page].filter(row => row.type === "tile").map(row => row.assetId)}
      initialVideoIds={groups[page].filter(row => row.type === "video").map(row => row.assetId)}
      initialWrittenIds={groups[page].filter(row => row.type === "written").map(row => row.assetId)}
      onOpenChange={open => { if (!open) setPage(null); }} />}
  </>;
}
