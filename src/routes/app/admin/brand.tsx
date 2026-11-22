import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import BrandIdentityPage from "@/features/admin/brand/BrandIdentityPage";

export const Route = createFileRoute("/app/admin/brand")({
  head: () => ({
    meta: [
      { title: "Brand Identity — AutoSocials Super Admin" },
      { name: "description", content: "Read-only live reference for the AutoSocials visual system." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <SuperAdminRoute>
      <BrandIdentityPage />
    </SuperAdminRoute>
  ),
});
