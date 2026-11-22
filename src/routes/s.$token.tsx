import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { getSharedVideos } from "@/lib/share.functions";
import { BrandedVideo } from "@/features/brand/BrandedVideo";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/s/$token")({
  loader: ({ params }) => getSharedVideos({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const title = loaderData ? `Videos for ${loaderData.brand} — shared via AutoSocials` : "Shared videos — AutoSocials";
    const description = loaderData ? `Watch ${loaderData.videos.length} video${loaderData.videos.length === 1 ? "" : "s"} made for ${loaderData.brand}.` : "This share link is no longer active.";
    return { meta: [
      { title }, { name: "description", content: description }, { name: "robots", content: "noindex" },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "video.other" }, { name: "twitter:card", content: "summary" },
    ] };
  },
  component: SharePage,
});

function SharePage() {
  const data = Route.useLoaderData();
  return (
    <main className="min-h-screen bg-canvas text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Logo size={24} />
        <a href="https://autosocials.com" className="text-[13px] font-medium underline underline-offset-2">Make videos like these</a>
      </header>
      {!data ? (
        <div className="mx-auto max-w-md p-16 text-center">
          <h1 className="font-display text-[26px] font-bold">This link is no longer active</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Ask the person who shared it to send a new one.</p>
        </div>
      ) : (
        <section className="mx-auto max-w-6xl px-6 py-10">
          <h1 className="font-display text-[32px] font-bold tracking-tight">{data.videos.length === 1 ? "A new video" : `${data.videos.length} new videos`} for {data.brand}</h1>
          <div className="mt-8 flex flex-wrap items-start justify-center gap-8">
            {data.videos.map((v) => {
              const [w, h] = v.size.split("x").map(Number);
              return (
                <article key={v.id} className="flex flex-col gap-3" style={{ width: w! < h! ? 340 : w === h ? 440 : 640, maxWidth: "100%" }}>
                  <div className="overflow-hidden rounded-[18px] border-2 border-ink" style={{ aspectRatio: `${w} / ${h}` }}>
                    {v.url ? <BrandedVideo fill src={v.url} name={v.hook} downloadUrl={v.download} /> : <div className="grid h-full place-items-center text-[13px] text-muted-foreground">Video unavailable</div>}
                  </div>
                  <p className="font-semibold leading-snug">{v.hook}</p>
                  {v.download && <a href={v.download} download className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse hover:bg-ink-hover"><Download className="h-4 w-4" />Download original</a>}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
