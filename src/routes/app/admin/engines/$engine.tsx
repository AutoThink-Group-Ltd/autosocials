import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import { EngineGallery } from "@/features/admin/Engines";
export const Route = createFileRoute("/app/admin/engines/$engine")({ head: () => ({ meta: [{ title: "Engine gallery — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }), component: Page });
function Page() { const { engine } = Route.useParams(); return <SuperAdminRoute><EngineGallery id={engine} /></SuperAdminRoute>; }
