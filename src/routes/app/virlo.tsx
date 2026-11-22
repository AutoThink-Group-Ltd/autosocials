import { createFileRoute } from "@tanstack/react-router";
import { VirloResearchPage } from "@/features/virlo/VirloResearchPage";

export const Route = createFileRoute("/app/virlo")({
  head: () => ({ meta: [{ title: "Research — AutoSocials" }] }),
  component: VirloResearchPage,
});
