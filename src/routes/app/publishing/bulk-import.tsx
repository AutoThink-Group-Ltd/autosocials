import { createFileRoute } from "@tanstack/react-router";
import PublishingBulkImportPage from "@/pages/app/PublishingBulkImportPage";

export const Route = createFileRoute("/app/publishing/bulk-import")({
  component: PublishingBulkImportPage,
});
