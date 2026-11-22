import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import SeoPlanPage from "@/features/admin/seo/SeoPlanPage";

export const Route = createFileRoute("/app/admin/seo-plan")({
  head: () => ({ meta: [{ title: "SEO Plan — AutoSocials Super Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <SuperAdminRoute><SeoPlanPage /></SuperAdminRoute>,
});
