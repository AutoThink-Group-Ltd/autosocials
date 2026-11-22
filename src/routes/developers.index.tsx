import { createFileRoute } from "@tanstack/react-router";
import { DeveloperDocs } from "@/features/developers/DeveloperDocs";
import { seoHead } from "@/lib/seo-head";
export const Route = createFileRoute("/developers/")({
  head: () => seoHead("/developers"),
  component: () => <DeveloperDocs />,
});
