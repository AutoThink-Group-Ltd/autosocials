import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import EngineEconomics from "@/features/admin/EngineEconomics";
export const Route = createFileRoute("/app/admin/engine-economics")({
  head: () => ({ meta: [{ title: "Engine Economics — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <SuperAdminRoute><EngineEconomics /></SuperAdminRoute>,
});
