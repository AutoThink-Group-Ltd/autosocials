import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import VirloUsage from "@/features/admin/VirloUsage";

export const Route = createFileRoute("/app/admin/virlo-usage")({
  head: () => ({
    meta: [
      { title: "Virlo usage — AutoSocials Super Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <SuperAdminRoute>
      <VirloUsage />
    </SuperAdminRoute>
  ),
});
