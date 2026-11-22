import { createFileRoute } from "@tanstack/react-router";
import ListDetailPage from "@/pages/app/ListDetailPage";

export const Route = createFileRoute("/app/lists/$id")({
  component: ListDetailPage,
});
