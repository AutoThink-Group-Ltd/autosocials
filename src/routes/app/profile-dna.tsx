import { createFileRoute } from "@tanstack/react-router";
import { ProfileDnaPage } from "@/features/brand/dna/ProfileDnaPage";

export const Route = createFileRoute("/app/profile-dna")({
  head: () => ({ meta: [{ title: "Profile DNA — AutoSocials" }] }),
  component: ProfileDnaPage,
});
