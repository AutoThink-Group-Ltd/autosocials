import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import HiggsfieldCosts from "@/features/admin/HiggsfieldCosts";

export const Route = createFileRoute("/app/admin/higgsfield")({
  head: () => ({ meta: [{ title: "Higgsfield costs — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <SuperAdminRoute><HiggsfieldCosts /></SuperAdminRoute>,
});
