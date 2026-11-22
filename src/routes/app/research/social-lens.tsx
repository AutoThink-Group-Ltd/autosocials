import { createFileRoute } from "@tanstack/react-router";
import { SocialLens } from "@/features/research/SocialLens";

export const Route = createFileRoute("/app/research/social-lens")({
  head: () => ({ meta: [{ title: "Social Lens — AutoSocials" }] }),
  component: SocialLens,
});
