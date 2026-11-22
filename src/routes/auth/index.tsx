import { createFileRoute } from "@tanstack/react-router";
import PublicTrackingWrapper from "@/components/app/PublicTrackingWrapper";
import { seoHead } from "@/lib/seo-head";
import AuthPage from "@/pages/AuthPage";

export const Route = createFileRoute("/auth/")({
  head: () => seoHead("/auth"),
  component: () => (
    <>
      <PublicTrackingWrapper />
      <AuthPage />
    </>
  ),
});
