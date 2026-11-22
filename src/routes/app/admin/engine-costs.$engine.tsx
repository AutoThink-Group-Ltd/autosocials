import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import { EngineEconomicsDetail } from "@/features/admin/EngineEconomics";
export const Route = createFileRoute("/app/admin/engine-costs/$engine")({
  head: () => ({ meta: [{ title: "Engine Economics — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});
function Page() { const { engine } = Route.useParams(); return <SuperAdminRoute><EngineEconomicsDetail id={engine} /></SuperAdminRoute>; }
