import { createFileRoute } from "@tanstack/react-router";
import { StageView } from "@/workspace/live-view/StageView";
import { LearnSurface } from "@/features/learn/LearnSurface";

export const Route = createFileRoute("/app/learn")({
  head: () => ({ meta: [{ title: "Learn & repeat — AutoSocials" }] }),
  component: () => (
    <StageView module="learn">
      <LearnSurface />
    </StageView>
  ),
});
