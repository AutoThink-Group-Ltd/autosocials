import { createFileRoute } from "@tanstack/react-router";
import DeletedItemsPage from "@/pages/app/DeletedItemsPage";

export const Route = createFileRoute("/app/settings/deleted-items")({
  head: () => ({ meta: [{ title: "Deleted Items — AutoSocials" }] }),
  component: DeletedItemsPage,
});
