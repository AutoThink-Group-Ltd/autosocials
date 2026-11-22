import { createFileRoute } from "@tanstack/react-router";
import { BrandAssets } from "@/features/brand/BrandAssets";

export const Route = createFileRoute("/app/brand-assets")({
  head: () => ({ meta: [{ title: "Brand assets — AutoSocials" }, { name: "description", content: "Upload files and notes Sam uses to understand and represent your brand." }] }),
  component: BrandAssets,
});
