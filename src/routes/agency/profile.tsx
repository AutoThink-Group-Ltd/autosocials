import { createFileRoute } from "@tanstack/react-router";
import AgencyProfilePage from "@/features/agency/AgencyProfilePage";

export const Route = createFileRoute("/agency/profile")({
  head: () => ({ meta: [{ title: "My profile — AutoSocials Agency" }, { name: "robots", content: "noindex" }] }),
  component: AgencyProfilePage,
});
