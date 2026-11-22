import { createFileRoute } from "@tanstack/react-router";
import { BrandDnaPage } from "@/features/brand/dna/BrandDnaPage";
export const Route = createFileRoute("/app/brand-dna")({
  head: () => ({
    meta: [
      { title: "Brand DNA — AutoSocials" },
      {
        name: "description",
        content: "Explore and review your brand identity.",
      },
    ],
  }),
  component: BrandDnaPage,
});
