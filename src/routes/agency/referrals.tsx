import { createFileRoute } from "@tanstack/react-router";
import AgencyReferralsPage from "@/pages/agency/AgencyReferralsPage";

export const Route = createFileRoute("/agency/referrals")({
  component: AgencyReferralsPage,
});
