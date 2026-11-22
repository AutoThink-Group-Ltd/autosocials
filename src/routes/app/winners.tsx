import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/workspace/live-view/StageView";
import { WinnersSurface } from "@/features/winners/WinnersSurface";

export const Route = createFileRoute("/app/winners")({
  head: () => ({ meta: [{ title: "Find winners — AutoSocials" }] }),
  component: () => (
    <StageView module="winners">
      <WinnersSurface />
    </StageView>
  ),
});
