import { createFileRoute } from "@tanstack/react-router";
import BillingPage from "@/pages/app/BillingPage";

export const Route = createFileRoute("/app/billing")({
  component: BillingPage,
});
