import { createFileRoute } from "@tanstack/react-router";
import OAuthBridgePage from "@/pages/OAuthBridgePage";

export const Route = createFileRoute("/oauth/bridge")({
  component: OAuthBridgePage,
});
