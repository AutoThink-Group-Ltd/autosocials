import { createFileRoute } from "@tanstack/react-router";
import ListsPage from "@/pages/app/ListsPage";

export const Route = createFileRoute("/app/lists/")({
  component: ListsPage,
});
