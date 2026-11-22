import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Facebook, Instagram, Music2, Youtube } from "lucide-react";
import { SiX } from "react-icons/si";
import { NativeAccountFeed, type FeedPlatform } from "@/components/publishing/NativeAccountFeed";
import { supabase } from "@/integrations/supabase/client";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/client-social-profiles";
import { SocialGallery } from "./BrandReviewHome";

export type SavedChannel = { platform: SocialPlatform; handle: string; url: string | null; status: string; posts: { url: string; date: string | null; caption: string; cover: string | null; hasVideo?: boolean }[] };
export type HomeChannel = { id: string; platform: string; display_name: string | null; handle: string | null; avatar_url: string | null; expires_at: string | null };
const CHANNELS = { facebook: { label: "Facebook", Icon: Facebook }, instagram: { label: "Instagram", Icon: Instagram }, x: { label: "X", Icon: SiX }, youtube: { label: "YouTube", Icon: Youtube }, tiktok: { label: "TikTok", Icon: Music2 } } as const;
function supported(platform: string): platform is FeedPlatform { return Object.hasOwn(CHANNELS, platform); }

export function HomeChannelFeeds({ workspaceId, onOpen, profiles = [], onOpenSaved, selected }: { workspaceId: string; onOpen: (account: HomeChannel) => void; profiles?: SavedChannel[]; onOpenSaved?: (profile: SavedChannel) => void; selected?: SavedChannel | null }) {
  const accounts = useQuery({
    queryKey: ["home-channel-feeds", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("social_accounts")
        .select("id,platform,display_name,handle,avatar_url,expires_at")
        .eq("workspace_id", workspaceId).eq("status", "connected").eq("is_enabled", true)
        .in("platform", ["facebook", "instagram", "x", "youtube", "tiktok"]).order("display_name");
      if (error) throw error;
      return data.filter((account) => ["x", "youtube", "tiktok"].includes(account.platform) || !account.expires_at || Date.parse(account.expires_at) > Date.now());
    },
  });
  const connected = accounts.data ?? [];
  const fallback = profiles.filter(profile => !connected.some(account => account.platform === profile.platform));
  if (!connected.length && !fallback.length) return null;
  return <div className="flex flex-wrap items-center gap-2" aria-label="Social channels">
    {onOpenSaved && <SavedChannelIcons profiles={fallback} onOpen={onOpenSaved} selected={selected} />}
    {connected.map((account) => {
      if (!supported(account.platform)) return null;
      const { label: platform, Icon } = CHANNELS[account.platform];
      const name = account.display_name || account.handle || platform;
      return <button key={account.id} type="button" onClick={() => onOpen(account)} aria-label={`Open ${platform} feed for ${name}`} title={`${platform}: ${account.handle ? `@${account.handle}` : name} (connected)`} className="inline-flex size-11 items-center justify-center rounded-xl border border-border-control bg-surface hover:bg-surface-subtle"><Icon className="size-5" aria-hidden /></button>;
    })}
  </div>;
}

export function SavedChannelIcons({ profiles, onOpen, selected }: { profiles: SavedChannel[]; onOpen: (profile: SavedChannel) => void; selected?: SavedChannel | null }) {
  if (!profiles.length) return null;
  return <div className="flex flex-wrap items-center gap-2" aria-label="Saved social profiles">{profiles.map((profile, index) => SOCIAL_PLATFORMS.includes(profile.platform) && <button key={`${profile.platform}:${profile.handle}:${index}`} type="button" onClick={() => onOpen(profile)} title={`${profile.platform}: @${profile.handle} (saved profile)`} aria-label={`Open ${profile.platform} saved profile feed for @${profile.handle}`} aria-pressed={selected?.platform === profile.platform && selected?.handle === profile.handle} className="inline-flex size-11 items-center justify-center rounded-xl border border-border-control bg-surface hover:bg-surface-subtle aria-pressed:bg-surface-subtle"><SocialChannelIcon platform={profile.platform} className="size-5" /></button>)}</div>;
}

export function SavedChannelFeedPane({ workspaceId, profile, onClose, toolbar, onRefresh, refreshing }: { workspaceId: string; profile: SavedChannel; onClose: () => void; toolbar: React.ReactNode; onRefresh: () => void; refreshing: boolean }) {
  const name = profile.platform === "x" ? "X" : profile.platform[0].toUpperCase() + profile.platform.slice(1);
  return <main className="min-h-0 w-full flex-1 overflow-y-auto p-4 text-ink md:p-6"><div className="mx-auto max-w-4xl space-y-6">
    <header className="flex flex-wrap items-center gap-4 border-b pb-4"><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-control bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle"><ArrowLeft className="size-4" aria-hidden />Home</button><div><h1 className="font-display text-2xl font-bold">{name} profile</h1><p className="text-sm text-muted-foreground">Saved public profile · @{profile.handle}</p></div><div className="ml-auto">{toolbar}</div></header>
    <div className="flex flex-wrap items-center justify-between gap-3">{profile.url && <a href={profile.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">View profile ↗</a>}<button type="button" onClick={onRefresh} disabled={refreshing} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">{refreshing ? "Refreshing profiles…" : "Refresh public posts"}</button></div>
    {profile.posts.length ? <SocialGallery workspaceId={workspaceId} posts={profile.posts} platform={profile.platform} grid /> : <p className="text-sm text-muted-foreground">{profile.status === "unsupported" ? "Public post collection is not yet available for this platform." : profile.status === "unavailable" ? "Posts could not be retrieved from this profile." : profile.status === "empty" ? "No public posts were returned for this profile." : "No saved posts are available for this profile."}</p>}
  </div></main>;
}

export function HomeChannelFeedPane({ account, onClose, toolbar }: { account: HomeChannel; onClose: () => void; toolbar?: React.ReactNode }) {
  if (!supported(account.platform)) return null;
  return <main className="min-h-0 w-full flex-1 overflow-y-auto p-4 text-ink md:p-6">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center gap-4 border-b pb-4">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-control bg-surface px-4 text-sm font-semibold hover:bg-surface-subtle"><ArrowLeft className="size-4" aria-hidden />Home</button>
        <div><h1 className="font-display text-2xl font-bold">{CHANNELS[account.platform].label} feed</h1><p className="text-sm text-muted-foreground">Your connected channel’s recent posts</p></div>
        <div className="ml-auto">{toolbar}</div>
      </header>
      <NativeAccountFeed key={account.id} socialAccountId={account.id} fallbackName={account.display_name || account.handle || "Your account"} fallbackHandle={account.handle} fallbackAvatar={account.avatar_url} platform={account.platform} />
    </div>
  </main>;
}
