import { createFileRoute } from "@tanstack/react-router";
import AcceptClientInvitePage from "@/pages/AcceptClientInvitePage";

export const Route = createFileRoute("/accept-invite")({
  component: AcceptClientInvitePage,
});
