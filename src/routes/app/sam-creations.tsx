import { createFileRoute, redirect } from "@tanstack/react-router";
import { SamCreationsPage } from "@/features/create/wizard/SamCreationsPage";

// Preserve old bookmarks while using the shared content library.
export const Route = createFileRoute("/app/sam-creations")({
  validateSearch: (search: Record<string, unknown>) : { folders?: boolean } => (Number(search["folders"]) === 1 ? { folders: true } : {}),
  beforeLoad: ({ search }) => {
    if (!search.folders) throw redirect({ href: "/app/create?stage=ready", replace: true });
  },
  component: SamCreationsPage,
});
