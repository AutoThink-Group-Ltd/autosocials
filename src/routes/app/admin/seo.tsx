import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import SeoHealthPage from "@/features/admin/seo/SeoHealthPage";

export const Route = createFileRoute("/app/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO Health — AutoSocials Super Admin" },
      { name: "description", content: "Live SEO and answer-engine health of autosocials.com." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <SuperAdminRoute>
      <SeoHealthPage />
    </SuperAdminRoute>
  ),
});
