import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import SuperAdminPanel from "@/pages/app/SuperAdminPanel";

export const Route = createFileRoute("/app/admin/")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s['tab'] === "string" ? { tab: s['tab'] } : {}),
  head: () => ({ meta: [
    { title: "Admin console — AutoSocials" },
    { name: "description", content: "AutoSocials super admin overview and platform management." },
    { property: "og:title", content: "Admin console — AutoSocials" },
    { property: "og:description", content: "AutoSocials super admin overview and platform management." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AdminIndex,
});

function AdminIndex() {
  const { tab } = Route.useSearch();
  return (
    <SuperAdminRoute>
      <SuperAdminPanel section={tab ?? "overview"} />
    </SuperAdminRoute>
  );
}
