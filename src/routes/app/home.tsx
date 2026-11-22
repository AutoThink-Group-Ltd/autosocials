import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/features/home/HomePage";

export const Route = createFileRoute("/app/home")({
  validateSearch: (input: Record<string, unknown>): { view?: "work" } =>
    input.view === "work" ? { view: "work" } : {},
  head: () => ({
    meta: [
      { title: "Home — AutoSocials" },
      {
        name: "description",
        content:
          "Pick up your recent videos, check production progress and retry failed work.",
      },
    ],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  return <HomePage workOverview={Route.useSearch().view === "work"} />;
}
