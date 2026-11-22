import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/marketing/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — AutoSocials" },
      { name: "description", content: "The terms for using AutoSocials." },
      { property: "og:title", content: "Terms — AutoSocials" },
      { property: "og:description", content: "The terms for using AutoSocials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage title="Terms of service" />,
});
