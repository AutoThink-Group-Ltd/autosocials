import { createFileRoute } from "@tanstack/react-router";
import JoinInvitePage from "@/pages/JoinInvitePage";

export const Route = createFileRoute("/join/$token")({
  head: () => ({
    meta: [
      { title: "Accept your invitation — AutoSocials" },
      { name: "description", content: "Accept your team invitation and set your password to start working in AutoSocials." },
      { property: "og:title", content: "Accept your invitation — AutoSocials" },
      { property: "og:description", content: "Join your team on AutoSocials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinRoute,
});

function JoinRoute() {
  const { token } = Route.useParams();
  return <JoinInvitePage token={token} />;
}
