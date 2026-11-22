import { createFileRoute, notFound } from "@tanstack/react-router";
import { DeveloperDocs } from "@/features/developers/DeveloperDocs";
import { developerPages } from "@/features/developers/content";
import { seoHead } from "@/lib/seo-head";
export const Route = createFileRoute("/developers/$slug")({
  loader: ({ params }) => {
    const page = developerPages.find((item) => item.slug === params.slug);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) =>
    loaderData ? seoHead(`/developers/${loaderData.slug}`) : {},
  component: DeveloperPageRoute,
});

function DeveloperPageRoute() {
  return <DeveloperDocs page={Route.useLoaderData()} />;
}
