import { createFileRoute } from "@tanstack/react-router";
import PublishingComposerPage from "@/pages/app/PublishingComposerPage";

export const Route = createFileRoute("/app/publishing/composer")({
  component: PublishingComposerPage,
});
