import { createFileRoute } from "@tanstack/react-router";
import AskVibePage from "@/pages/app/AskVibePage";

export const Route = createFileRoute("/app/ask-vibe")({
  component: AskVibePage,
});
