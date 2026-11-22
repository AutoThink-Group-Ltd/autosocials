import { createFileRoute } from "@tanstack/react-router";
import OutreachTemplatesPage from "@/pages/app/OutreachTemplatesPage";

export const Route = createFileRoute("/app/templates")({
  component: OutreachTemplatesPage,
});
