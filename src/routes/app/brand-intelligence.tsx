import { createFileRoute } from "@tanstack/react-router";
import BrandIntelligencePage from "@/pages/app/BrandIntelligencePage";

export const Route = createFileRoute("/app/brand-intelligence")({
  component: BrandIntelligencePage,
});
