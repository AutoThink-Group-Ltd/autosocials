import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import Home from "@/pages/Home";

export const Route = createFileRoute("/")({
  head: () => seoHead("/"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <Home />
    </>
  ),
});
