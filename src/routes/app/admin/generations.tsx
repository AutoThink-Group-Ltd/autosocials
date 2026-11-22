import { createFileRoute } from "@tanstack/react-router";
import SuperAdminRoute from "@/components/app/SuperAdminRoute";
import GenerationTracker from "@/features/admin/GenerationTracker";
export const Route = createFileRoute("/app/admin/generations")({
  head: () => ({ meta: [{ title: "Generation tracker — AutoSocials Super Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => <SuperAdminRoute><GenerationTracker /></SuperAdminRoute>,
});
