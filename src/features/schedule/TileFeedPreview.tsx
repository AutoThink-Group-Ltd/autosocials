import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, ExternalLink, Globe, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from "lucide-react";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import { getTileChannelCaption } from "@/lib/creation-schedule.functions";
import { channelStatusLabel, publishedPostLink, type AssetChannelStatus } from "./useAssetPublishingStatus";

const channels = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", x: "X" } as const;
type Channel = keyof typeof channels;

export function TileFeedPreview({ workspaceId, tileId, title, imageUrl, authorName, savedCaption, publishingHistory }: {
  workspaceId: string;
  tileId: string;
  title: string;
  imageUrl?: string | undefined;
  authorName?: string;
  savedCaption?: { platform: string; caption: string } | undefined;
  publishingHistory?: AssetChannelStatus[] | undefined;
}) {
  const [channel, setChannel] = useState<Channel>(savedCaption && Object.hasOwn(channels, savedCaption.platform) ? savedCaption.platform as Channel : "linkedin");
  const getCaption = useServerFn(getTileChannelCaption);
  const original = savedCaption?.platform === channel && channel !== "x" ? savedCaption.caption : undefined;
  const draft = useQuery({
    queryKey: ["tile-feed-caption", workspaceId, tileId, channel],
    queryFn: () => getCaption({ data: { workspace_id: workspaceId, tile_id: tileId, platform: channel } }),
    enabled: !original,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const caption = original ?? draft.data?.caption;
  const { currentWorkspace } = useWorkspace();
  const author = authorName || (currentWorkspace?.id === workspaceId && currentWorkspace.name) || "Your account";
  const deliveries = publishingHistory?.filter(delivery => delivery.platform === channel);
  const feedImage = imageUrl && <img src={imageUrl} alt="" className="mx-auto block max-h-72 w-full bg-surface-subtle object-contain" />;
  return <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <section className="min-w-0" aria-label="Channel feed preview">
      <div role="group" aria-label="Preview channel" className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(channels) as Channel[]).map(key => <button type="button" key={key} aria-label={channels[key]} aria-pressed={channel === key} onClick={() => setChannel(key)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border-control px-2.5 text-xs font-semibold aria-pressed:bg-ink aria-pressed:text-inverse">
          <SocialChannelIcon platform={key} className="size-4" />{channel === key && channels[key]}
        </button>)}
      </div>
      <section aria-label={`${channels[channel]} publishing history`} className="mb-3 rounded-xl border border-border bg-card p-3 text-sm">
        {deliveries?.length ? <ul className="space-y-3">{deliveries.map(delivery => {
          const link = publishedPostLink(delivery);
          const account = channel === "facebook" ? `${delivery.account} (Page)` : delivery.account;
          return <li key={`${delivery.postId}-${delivery.accountId}`} className="space-y-1">
            <p className="font-semibold">{channelStatusLabel({ ...delivery, account, date: null })}</p>
            {delivery.date && <time dateTime={delivery.date} className="block text-xs text-muted-foreground">
              {new Date(delivery.date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
            </time>}
            {delivery.status === "published" && delivery.platformPostId && <p className="break-all text-xs text-muted-foreground">Post ID {delivery.platformPostId}</p>}
            {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold underline">
              Open post on {channels[channel]} <ExternalLink aria-hidden className="size-3.5" /><span className="sr-only"> (opens in a new tab)</span>
            </a>}
            {delivery.status === "published" && !link && <p className="text-xs text-muted-foreground">Post link unavailable.</p>}
          </li>;
        })}</ul> : <p className="text-muted-foreground">
          {deliveries ? `No publishing record for ${channels[channel]}.` : "Publishing history unavailable."}
        </p>}
      </section>
      <article aria-label={channels[channel] + " feed preview"} className="max-h-[65dvh] overflow-auto rounded-xl border border-border bg-card">
        <header className="flex items-center gap-2.5 p-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-subtle text-sm font-semibold">{author.slice(0,1).toUpperCase()}</span>
          <div><p className="text-sm font-semibold">{author}</p><p className="flex items-center gap-1 text-xs text-muted-foreground">{channels[channel]} preview {channel !== "instagram" && <Globe aria-hidden className="size-3" />}</p></div>
        </header>
        {channel === "instagram" && feedImage}
        <div className="p-3 pt-2" aria-live="polite">
          {caption ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{caption}</p> : draft.isError ? <p role="alert" className="text-sm">Couldn’t load this caption. <button type="button" className="underline" onClick={() => void draft.refetch()}>Try again</button></p> : <p role="status" className="text-sm text-muted-foreground">Preparing the {channels[channel]} caption…</p>}
        </div>
        {channel !== "instagram" && feedImage}
        <div aria-hidden className="flex items-center justify-between border-t px-4 py-3 text-muted-foreground">
          {channel === "linkedin" || channel === "facebook" ? <ThumbsUp className="size-4" /> : <Heart className="size-4" />}
          <MessageCircle className="size-4" />{channel === "x" ? <Repeat2 className="size-4" /> : channel === "facebook" ? <Share2 className="size-4" /> : <Send className="size-4" />}
          {channel === "instagram" && <Bookmark className="size-4" />}
        </div>
      </article>
    </section>
    {imageUrl && <div className="flex items-start justify-center"><img src={imageUrl} alt={title} className="max-h-[72dvh] w-full rounded-xl object-contain object-top" /></div>}
  </div>;
}

