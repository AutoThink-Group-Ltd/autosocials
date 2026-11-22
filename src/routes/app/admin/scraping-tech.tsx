import { createFileRoute } from "@tanstack/react-router";
import ScrapingTechPage from "@/pages/app/ScrapingTechPage";

export const Route = createFileRoute("/app/admin/scraping-tech")({
  component: ScrapingTechPage,
});
