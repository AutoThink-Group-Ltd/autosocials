import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import { EnginesOverview } from "@/features/admin/Engines";
export const Route = createFileRoute("/app/admin/engines/")({ head: () => ({ meta: [{ title: "Engines — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }), component: () => <SuperAdminRoute><EnginesOverview /></SuperAdminRoute> });
