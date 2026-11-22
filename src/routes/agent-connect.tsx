import { createFileRoute } from "@tanstack/react-router";
import { AgentConsentPage } from "@/features/agent-access/AgentConsentPage";
export const Route = createFileRoute("/agent-connect")({
  validateSearch: (search: Record<string, unknown>) => ({
    request_id:
      typeof search["request_id"] === "string" ? search["request_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Connect an agent | AutoSocials" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AgentConnectRoute,
});

function AgentConnectRoute() {
  return <AgentConsentPage requestId={Route.useSearch().request_id} />;
}
