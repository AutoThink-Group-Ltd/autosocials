import { createFileRoute } from "@tanstack/react-router";
import PublishingHashtagsPage from "@/pages/app/PublishingHashtagsPage";

export const Route = createFileRoute("/app/publishing/hashtags")({
  component: PublishingHashtagsPage,
});
