import { createFileRoute } from "@tanstack/react-router";
import { OutreachPage } from "@/features/outreach/OutreachPage";

export const Route = createFileRoute("/app/outreach")({
  head: () => ({ meta: [{ title: "Outreach — AutoSocials" }] }),
  component: OutreachPage,
});
