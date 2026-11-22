import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { creatorsApi, type FeedItem } from "@/lib/api/creators";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Users, Heart, Eye, Play, BarChart3, ExternalLink,
  Loader2, RefreshCw, MapPin, Grid3X3, Video, X,
  Globe, Mail,
} from "lucide-react";

function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getInstagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i);
  if (!match?.[1]) return null;
  return `https://www.instagram.com/p/${match[1]}/embed/`;
}

function FeedThumb({ item, onClick }: { item: FeedItem; onClick: () => void }) {
  const [failed, setFailed] = useState(false);

  if (item.thumbnail_url && !failed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative aspect-[9/16] rounded-lg overflow-hidden border border-border bg-secondary hover:shadow-md hover:-translate-y-0.5 transition-all"
      >
        <img
          src={item.thumbnail_url}
          alt={item.title || ""}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-foreground ml-0.5" />
          </div>
        </div>
        {item.title && (
          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[10px] text-white line-clamp-2">{item.title}</p>
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-[9/16] rounded-lg overflow-hidden border border-border bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
    >
      <Play className="w-5 h-5 text-muted-foreground" />
    </button>
  );
}

interface CreatorProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorId: string | null;
}

export function CreatorProfileDialog({ open, onOpenChange, creatorId }: CreatorProfileDialogProps) {
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  const loadCreator = useCallback(async (id: string) => {
    setLoading(true);
    setFeedItems([]);
    const { data } = await supabase
      .from("creator_profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setCreator(data);
      // Auto-enrich if missing key stats
      if (!data.follower_count && !data.total_likes) {
        enrichCreator(id);
      }
      fetchFeed(data.username, data.platform, Math.min(Math.max(data.video_count || 20, 20), 60));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && creatorId) {
      loadCreator(creatorId);
    }
    if (!open) {
      setCreator(null);
      setFeedItems([]);
      setActiveVideoUrl(null);
    }
  }, [open, creatorId, loadCreator]);

  async function enrichCreator(id: string) {
    setEnriching(true);
    try {
      const { data } = await supabase.functions.invoke("enrich-creator", {
        body: { creator_id: id },
      });
      if (data?.success && data.data) {
        setCreator(data.data);
      }
    } catch (err) {
      console.error("Enrich failed:", err);
    }
    setEnriching(false);
  }

  async function fetchFeed(username: string, platform: string, limit: number) {
    setFeedLoading(true);
    try {
      const result = await creatorsApi.fetchFeed(username, platform, limit);
      if (result.success && result.data) {
        setFeedItems(result.data);
      }
      // For Instagram, refetch the creator to get updated stats from the feed function
      if (platform === "instagram" && creator?.id) {
        const { data: refreshed } = await supabase
          .from("creator_profiles")
          .select("*")
          .eq("id", creator.id)
          .single();
        if (refreshed) setCreator(refreshed);
      }
    } catch (err) {
      console.error("Feed fetch failed:", err);
    }
    setFeedLoading(false);
  }

  const stats = creator ? [
    { icon: Users, label: "Followers", value: formatCount(creator.follower_count), color: "text-blue-500" },
    { icon: Eye, label: "Avg Views", value: formatCount(creator.avg_views), color: "text-emerald-500" },
    { icon: Heart, label: "Total Likes", value: formatCount(creator.total_likes), color: "text-pink-500" },
    { icon: BarChart3, label: "Engagement", value: creator.engagement_rate ? `${Number(creator.engagement_rate).toFixed(2)}%` : "—", color: "text-amber-500" },
    { icon: Video, label: "Videos", value: formatCount(creator.video_count), color: "text-purple-500" },
    { icon: Users, label: "Following", value: formatCount(creator.following_count), color: "text-indigo-500" },
  ] : [];

  const profileUrl = creator?.profile_url || (
    creator?.platform === "tiktok"
      ? `https://www.tiktok.com/@${creator?.username}`
      : `https://www.instagram.com/${creator?.username}/`
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : creator ? (
          <div>
            {/* Header */}
            <div className="p-5 pb-0">
              <div className="flex items-start gap-4">
                <Avatar className="w-14 h-14 ring-2 ring-border">
                  <AvatarImage src={creator.avatar_url} alt={creator.username} />
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {(creator.display_name || creator.username || "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate">
                    {creator.display_name || creator.username}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                      {creator.platform === "tiktok" ? (
                        <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.77 1.52V6.84a4.84 4.84 0 01-1-.15z"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                      )}
                      <span className="text-xs text-muted-foreground">@{creator.username}</span>
                    </div>
                    {creator.location && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" /> {creator.location}
                      </span>
                    )}
                  </div>
                  {creator.contact_email && (
                    <a
                      href={`mailto:${creator.contact_email}`}
                      className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      <Mail className="w-3 h-3" /> {creator.contact_email}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => enrichCreator(creator.id)}
                    disabled={enriching}
                    title="Refresh stats"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${enriching ? "animate-spin" : ""}`} />
                  </Button>
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="brand" size="sm" className="gap-1 text-xs h-8">
                      <ExternalLink className="w-3 h-3" />
                      {creator.platform === "tiktok" ? "TikTok" : "Instagram"}
                    </Button>
                  </a>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="px-5 pt-4">
              {enriching && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Loader2 className="w-3 h-3 animate-spin" /> Fetching latest stats...
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-lg border border-border bg-secondary/30 p-2.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <s.icon className={`w-3 h-3 ${s.color}`} />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{s.label}</span>
                    </div>
                    <p className="text-base font-bold text-foreground">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bio & niches */}
            {(creator.bio || creator.niches?.length > 0) && (
              <div className="px-5 pt-3">
                {creator.bio && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-2">{creator.bio}</p>
                )}
                {creator.niches?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {creator.niches.map((n: string) => (
                      <Badge key={n} variant="secondary" className="text-[10px] px-2 py-0.5">{n}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator className="mt-4" />

            {/* Content Feed */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Grid3X3 className="w-3.5 h-3.5 text-primary" /> Content
                  {feedItems.length > 0 && (
                    <span className="text-muted-foreground font-normal">({feedItems.length})</span>
                  )}
                </h3>
                {feedItems.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 gap-1 px-2"
                    onClick={() => fetchFeed(creator.username, creator.platform, 60)}
                    disabled={feedLoading}
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${feedLoading ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                )}
              </div>

              {feedLoading && feedItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <p className="text-[11px] text-muted-foreground">Loading content from {creator.platform}...</p>
                </div>
              )}

              {!feedLoading && feedItems.length === 0 && (
                <div className="py-8 rounded-lg bg-secondary/30 flex flex-col items-center justify-center gap-1.5">
                  <Video className="w-6 h-6 text-muted-foreground/50" />
                  <span className="text-[11px] text-muted-foreground">No content found</span>
                </div>
              )}

              {feedItems.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {feedItems.slice(0, 12).map((item) => (
                    <FeedThumb
                      key={item.url}
                      item={item}
                      onClick={() => window.open(item.url, "_blank")}
                    />
                  ))}
                </div>
              )}

              {feedItems.length > 12 && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  +{feedItems.length - 12} more — view full profile for all content
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">Creator not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
