import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/marketing/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — AutoSocials" },
      { name: "description", content: "How AutoSocials handles your data." },
      { property: "og:title", content: "Privacy — AutoSocials" },
      { property: "og:description", content: "How AutoSocials handles your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage title="Privacy policy" />,
});
