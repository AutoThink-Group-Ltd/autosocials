import { createFileRoute } from "@tanstack/react-router";
import { PublicLeadOfferPage } from "@/features/agency/PublicLeadOfferPage";

export const Route = createFileRoute("/agency-offer/$token")({
  head: () => ({ meta: [{ title: "Your content offer — AutoSocials" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  headers: () => ({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" }),
  component: OfferRoute,
});

function OfferRoute() {
  const { token } = Route.useParams();
  return <PublicLeadOfferPage key={token} token={token} />;
}
