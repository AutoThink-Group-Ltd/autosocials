import { createFileRoute } from "@tanstack/react-router";
import PublishingApprovalsPage from "@/pages/app/PublishingApprovalsPage";

export const Route = createFileRoute("/app/publishing/approvals")({
  component: PublishingApprovalsPage,
});
