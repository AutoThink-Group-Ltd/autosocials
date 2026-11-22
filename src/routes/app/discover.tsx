import { createFileRoute } from "@tanstack/react-router";
import DiscoverPage from "@/pages/app/DiscoverPage";

export const Route = createFileRoute("/app/discover")({
  component: DiscoverPage,
});
