import { createFileRoute } from "@tanstack/react-router";
import { PublishingQueue } from "@/features/schedule/PublishingQueue";
export const Route = createFileRoute("/app/schedule")({
  head: () => ({ meta: [{ title: "Publish — AutoSocials" }] }),
  validateSearch: (search: Record<string, unknown>) => (typeof search["post"] === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(search["post"]) ? { post: search["post"] } : {}),
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { post } = Route.useSearch();
  return <PublishingQueue requestedPostId={post} />;
}
