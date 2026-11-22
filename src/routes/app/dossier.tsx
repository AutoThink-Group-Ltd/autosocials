import { createFileRoute } from "@tanstack/react-router";
import DossierPage from "@/pages/app/DossierPage";

export const Route = createFileRoute("/app/dossier")({
  component: DossierPage,
});
