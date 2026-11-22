import { createFileRoute } from "@tanstack/react-router";
import AdminBillingPage from "@/pages/app/AdminBillingPage";

export const Route = createFileRoute("/app/admin/billing")({
  component: AdminBillingPage,
});
