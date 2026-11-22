import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/workspace/live-view/StageView";
import { CampaignsSurface } from "@/features/campaigns/CampaignsSurface";

export const Route = createFileRoute("/app/campaigns")({
  head: () => ({ meta: [{ title: "Launch ads — AutoSocials" }] }),
  component: () => (
    <StageView module="campaigns">
      <CampaignsSurface />
    </StageView>
  ),
});
