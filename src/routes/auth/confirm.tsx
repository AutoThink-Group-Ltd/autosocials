import { createFileRoute } from "@tanstack/react-router";
import AuthConfirmPage from "@/pages/AuthConfirmPage";

export const Route = createFileRoute("/auth/confirm")({
  component: AuthConfirmPage,
});
