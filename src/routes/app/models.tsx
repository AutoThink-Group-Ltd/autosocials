import { createFileRoute } from "@tanstack/react-router";
import { ModelsPage } from "@/features/create/models/ModelsPage";

export const Route = createFileRoute("/app/models")({
  head: () => ({ meta: [{ title: "Models — AutoSocials" }, { name: "description", content: "Choose a video model, add your prompt and assets, and create a video." }] }),
  component: ModelsPage,
});
