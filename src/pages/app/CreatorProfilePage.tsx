import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { creatorsApi, type FeedItem } from "@/lib/api/creators";
import { SaveToListPopover } from "@/components/app/SaveToListPopover";
import { CreatorOutreachDialog } from "@/components/app/CreatorOutreachDialog";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Globe, Users, Heart, TrendingUp, Eye, Play, Plus, Tag,
  BarChart3, Clock, MapPin, Video, Calendar, Zap, ExternalLink, Loader2, RefreshCw, Grid3X3, Mail, X, Instagram
} from "lucide-react";

type CreatorProfile = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  latest_video_url: string | null;
  latest_video_description: string | null;
  follower_count: number | null;
  following_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  video_count: number | null;
  location: string | null;
  niches: string[];
  content_themes: string[];
  last_post_at: string | null;
  last_scraped_at: string | null;
  source_query: string | null;
  raw_data: any;
  created_at: string;
  updated_at: string;
  contact_email: string | null;
  contact_source: string | null;
  website_url: string | null;
};

const platformColors = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
];

const MAX_FEED_LIMIT = 120;

function getFeedLimit(videoCount: number | null | undefined): number {
  if (!videoCount || videoCount <= 0) return 40;
  return Math.min(Math.max(videoCount, 20), MAX_FEED_LIMIT);
}

function HeroBannerCell({ item, onImageError }: { item: FeedItem; onImageError: (url: string) => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const embedUrl = getInstagramEmbedUrl(item.url);

  if (item.thumbnail_url && !imgFailed) {
    return (
      <div className="relative overflow-hidden w-full h-full">
        <img
          src={item.thumbnail_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            setImgFailed(true);
            onImageError(item.thumbnail_url!);
          }}
        />
        <div className="absolute inset-0 bg-foreground/10" />
      </div>
    );
  }

  // Fallback: use Instagram embed iframe for Instagram posts
  if (embedUrl) {
    return (
      <div className="relative overflow-hidden w-full h-full">
        <iframe
          src={embedUrl}
          className="w-full h-full border-0 pointer-events-none scale-[2] origin-center"
          loading="lazy"
          referrerPolicy="no-referrer"
          title="cover"
        />
        <div className="absolute inset-0 bg-foreground/10" />
      </div>
    );
  }

  return null;
}

function HeroBanner({ feedItems, gradient }: { feedItems: FeedItem[]; gradient: string }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const handleError = (url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url));
  };

  // Items with working thumbnails
  const thumbItems = feedItems.filter(
    (i) => i.thumbnail_url && !failedUrls.has(i.thumbnail_url)
  );

  // Items that can use Instagram embed as fallback (no working thumbnail)
  const embedItems = feedItems.filter(
    (i) => (!i.thumbnail_url || failedUrls.has(i.thumbnail_url!)) && getInstagramEmbedUrl(i.url)
  );

  const displayItems = [...thumbItems, ...embedItems];

  return (
    <>
      {displayItems.length >= 3 ? (
        <div className="absolute inset-0 grid grid-cols-4 gap-0.5">
          {displayItems.slice(0, 4).map((item) => (
            <HeroBannerCell key={item.url} item={item} onImageError={handleError} />
          ))}
        </div>
      ) : displayItems.length > 0 ? (
        <div className="absolute inset-0 w-full h-full">
          <HeroBannerCell item={displayItems[0]!} onImageError={handleError} />
        </div>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
    </>
  );
}


function buildTikTokEmbedDoc(videoUrl: string): string {
  const match = videoUrl.match(/video\/(\d+)/);
  if (!match) return '';
  return `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;overflow:hidden}body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh}</style></head><body><blockquote class="tiktok-embed" cite="${videoUrl}" data-video-id="${match[1]}" style="max-width:100%"><section></section></blockquote><script async src="https://www.tiktok.com/embed.js"><\/script></body></html>`;
}

function getInstagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i);
  if (!match?.[1]) return null;
  return `https://www.instagram.com/p/${match[1]}/embed/`;
}

function FeedVideoCard({
  item,
  index,
  onOpen,
  fallbackGradient,
}: {
  item: FeedItem;
  index: number;
  onOpen: (item: FeedItem) => void;
  fallbackGradient: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [item.thumbnail_url]);

  const shouldShowImage = Boolean(item.thumbnail_url) && !hasImageError;
  const isTikTok = item.url?.includes('tiktok.com');
  const isInstagram = item.url?.includes('instagram.com');
  const instagramEmbedUrl = isInstagram ? getInstagramEmbedUrl(item.url) : null;
  const showTikTokEmbed = !shouldShowImage && isTikTok;
  const showInstagramEmbed = !shouldShowImage && Boolean(instagramEmbedUrl);

  return (
    <motion.button
      type="button"
      className="group relative aspect-[9/16] bg-card rounded-xl border border-border overflow-hidden hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200 cursor-pointer text-left"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => onOpen(item)}
    >
      {shouldShowImage ? (
        <img
          src={item.thumbnail_url!}
          alt={item.title || 'Video thumbnail'}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
        />
      ) : showTikTokEmbed ? (
        <iframe
          title={item.title || `TikTok video ${index + 1}`}
          srcDoc={buildTikTokEmbedDoc(item.url)}
          className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          allow="autoplay; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
        />
      ) : showInstagramEmbed ? (
        <iframe
          title={item.title || `Instagram post ${index + 1}`}
          src={instagramEmbedUrl!}
          className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient} flex items-center justify-center`}>
          <Play className="w-8 h-8 text-white/70" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {item.title && (
            <p className="text-[11px] text-white font-medium line-clamp-2 mb-1">{item.title}</p>
          )}
        </div>
      </div>

      {(shouldShowImage || showInstagramEmbed) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-elevated">
            <Play className="w-4 h-4 text-foreground ml-0.5" />
          </div>
        </div>
      )}
    </motion.button>
  );
}

function formatCount(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(date: string | null): string {
  if (!date) return "Unknown";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const CreatorProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<FeedItem | null>(null);
  const [otherProfiles, setOtherProfiles] = useState<Array<{ id: string; platform: string; username: string; avatar_url: string | null; follower_count: number | null }>>([]);
  const [crossPlatformLoading, setCrossPlatformLoading] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarFallbackFailed, setAvatarFallbackFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
    setAvatarFallbackFailed(false);
  }, [creator?.avatar_url, creator?.username, creator?.platform]);

  useEffect(() => {
    if (id) loadCreator(id);
  }, [id]);

  async function loadCreator(creatorId: string) {
    setLoading(true);
    const { data } = await supabase
      .from("creator_profiles")
      .select("*")
      .eq("id", creatorId)
      .single();

    if (data) {
      setCreator(data as unknown as CreatorProfile);
      if (!data.thumbnail_url) {
        enrichCreator(creatorId);
      }
      fetchFeed(data.username, data.platform, getFeedLimit(data.video_count), creatorId);
      findOtherProfiles(data.username, data.platform, creatorId);
    }
    setLoading(false);
  }

  async function findOtherProfiles(username: string, currentPlatform: string, currentId: string) {
    setCrossPlatformLoading(true);
    try {
      // Check DB for same username on other platforms
      const { data: existing } = await supabase
        .from("creator_profiles")
        .select("id,platform,username,avatar_url,follower_count")
        .eq("username", username)
        .neq("platform", currentPlatform);

      const found = (existing || []) as Array<{ id: string; platform: string; username: string; avatar_url: string | null; follower_count: number | null }>;

      // If on TikTok and no Instagram profile exists, try auto-scraping Instagram
      if (currentPlatform === "tiktok" && !found.some(p => p.platform === "instagram")) {
        try {
          const result = await creatorsApi.scrapeInstagramCreator(username);
          if (result.success && result.data) {
            found.push({
              id: result.data.id,
              platform: "instagram",
              username: result.data.username,
              avatar_url: result.data.avatar_url,
              follower_count: result.data.follower_count,
            });
          }
        } catch {
          // Instagram scrape failed silently — that's fine
        }
      }

      // If on Instagram and no TikTok profile exists, try Phyllo lookup
      if (currentPlatform === "instagram" && !found.some(p => p.platform === "tiktok")) {
        try {
          const result = await creatorsApi.phylloProfile(username, "tiktok");
          if (result.success && result.data) {
            found.push({
              id: result.data.id,
              platform: "tiktok",
              username: result.data.username,
              avatar_url: result.data.avatar_url,
              follower_count: result.data.follower_count,
            });
          }
        } catch {
          // TikTok lookup failed silently
        }
      }

      setOtherProfiles(found);
    } catch (err) {
      console.error("Cross-platform lookup failed:", err);
    } finally {
      setCrossPlatformLoading(false);
    }
  }

  async function fetchFeed(username: string, platform: string, limit = 40, creatorId?: string) {
    setFeedLoading(true);
    try {
      const result = await creatorsApi.fetchFeed(username, platform, limit);
      if (result.success && result.data) {
        setFeedItems(result.data);
      }

      if (platform === "instagram" && creatorId) {
        const { data: refreshedCreator } = await supabase
          .from("creator_profiles")
          .select("*")
          .eq("id", creatorId)
          .single();

        if (refreshedCreator) {
          setCreator(refreshedCreator as unknown as CreatorProfile);
        }
      }
    } catch (err) {
      console.error("Feed fetch failed:", err);
    } finally {
      setFeedLoading(false);
    }
  }

  async function enrichCreator(creatorId: string) {
    setEnriching(true);
    try {
      const { data } = await supabase.functions.invoke("enrich-creator", {
        body: { creator_id: creatorId },
      });
      if (data?.success && data.data) {
        setCreator(data.data as CreatorProfile);
      }
    } catch (err) {
      console.error("Enrich failed:", err);
    } finally {
      setEnriching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">Creator not found</p>
        <Button variant="outline" onClick={() => navigate("/app")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Discover
        </Button>
      </div>
    );
  }

  const colorIdx = creator.username.charCodeAt(0) % platformColors.length;
  const gradient = platformColors[colorIdx] ?? platformColors[0] ?? "";
  const instagramFallbackAvatar = creator.platform === "instagram"
    ? `https://unavatar.io/instagram/${encodeURIComponent(creator.username)}`
    : null;
  const videoLinks = (creator.raw_data as any)?.video_links || [];
  const contactEmail = creator.contact_email || (creator.raw_data as any)?.contact_details?.email;
  const contactDetails = ((creator.raw_data as any)?.contact_details || {}) as {
    email?: string;
    website?: string;
    instagram?: string;
    youtube?: string;
  };
  const contactItems = [
    contactEmail ? { label: "Email", value: contactEmail, href: `mailto:${contactEmail}` } : null,
    (creator.website_url || contactDetails.website) && !/tiktokcdn|muscdn|\.(webp|png|jpe?g)/i.test(creator.website_url || contactDetails.website || '')
      ? { label: "Website", value: creator.website_url || contactDetails.website!, href: creator.website_url || contactDetails.website! }
      : null,
    contactDetails.instagram
      ? {
          label: "Instagram",
          value: contactDetails.instagram,
          href: contactDetails.instagram.startsWith("http")
            ? contactDetails.instagram
            : `https://instagram.com/${contactDetails.instagram.replace(/^@/, "")}`,
        }
      : null,
    contactDetails.youtube
      ? {
          label: "YouTube",
          value: contactDetails.youtube,
          href: contactDetails.youtube.startsWith("http")
            ? contactDetails.youtube
            : `https://youtube.com/${contactDetails.youtube.startsWith("@") ? contactDetails.youtube : `@${contactDetails.youtube}`}`,
        }
      : null,
    creator.profile_url ? { label: "Profile", value: creator.profile_url, href: creator.profile_url } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href: string }>;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/app")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Discover
      </button>

      {/* Hero */}
      <motion.div
        className="bg-card rounded-2xl border border-border overflow-hidden mb-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Banner */}
        <div className="h-32 sm:h-40 md:h-52 relative overflow-hidden">
          <HeroBanner feedItems={feedItems} gradient={gradient} />
          {/* Platform badge */}
          <div className="absolute top-4 left-4 px-3 py-1 bg-card/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-foreground capitalize z-10">
            {creator.platform}
          </div>
          {enriching && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-card/90 backdrop-blur-sm rounded-lg text-xs text-foreground z-10">
              <Loader2 className="w-3 h-3 animate-spin" /> Enriching...
            </div>
          )}
        </div>

        {/* Profile info */}
        <div className="px-4 sm:px-6 md:px-8 -mt-10 sm:-mt-12 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
            <div className="flex items-end gap-4 sm:gap-5">
              {(creator.avatar_url && !avatarLoadFailed) || (instagramFallbackAvatar && !avatarFallbackFailed) ? (
                <img
                  src={creator.avatar_url && !avatarLoadFailed ? creator.avatar_url : instagramFallbackAvatar!}
                  alt={creator.display_name || creator.username}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-card object-cover shadow-elevated shrink-0"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (creator.avatar_url && !avatarLoadFailed) {
                      setAvatarLoadFailed(true);
                      return;
                    }
                    setAvatarFallbackFailed(true);
                  }}
                />
              ) : (
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center border-4 border-card shadow-elevated shrink-0`}>
                  <span className="text-white font-bold text-2xl sm:text-3xl">
                    {(creator.display_name || creator.username).charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 pb-1 sm:pb-2 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{creator.display_name || creator.username}</h1>
                <p className="text-muted-foreground text-sm">@{creator.username}</p>
              </div>
            </div>
            <div className="flex gap-2 pb-1 sm:pb-2 flex-wrap">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => enrichCreator(creator.id)}
                disabled={enriching}
              >
                <RefreshCw className={`w-4 h-4 ${enriching ? "animate-spin" : ""}`} />
              </Button>
              {creator.profile_url && (
                <a href={creator.profile_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="brand" size="sm" className="gap-1.5 text-xs">
                    <ExternalLink className="w-3 h-3" /> <span className="hidden sm:inline">View on</span> {creator.platform}
                  </Button>
                </a>
              )}
              <CreatorOutreachDialog creator={creator} />
              <SaveToListPopover creatorId={creator.id} />
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="px-4 sm:px-6 md:px-8 pt-4 pb-6">
          {creator.bio && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-4">{creator.bio}</p>
          )}
          {/* Contact Email */}
          {creator.contact_email && (
            <div className="flex items-center gap-2 mb-4">
              <a
                href={`mailto:${creator.contact_email}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
              >
                <Mail className="w-3.5 h-3.5" />
                {creator.contact_email}
              </a>
              {creator.contact_source && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  via {creator.contact_source}
                </span>
              )}
            </div>
          )}
          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {creator.niches?.map((n) => (
              <span key={n} className="text-xs px-3 py-1 rounded-full bg-primary/8 text-primary font-medium">
                {n}
              </span>
            ))}
            {creator.location && (
              <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {creator.location}
              </span>
            )}
          </div>
          {/* Other Profiles */}
          {(otherProfiles.length > 0 || crossPlatformLoading) && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Globe className="w-3 h-3" /> Other Profiles
                {crossPlatformLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </h4>
              <div className="flex flex-wrap gap-2">
                {otherProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/app/creator/${p.id}`)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border transition-colors text-sm"
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary">{p.username.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="capitalize font-medium text-foreground">{p.platform}</span>
                    {p.follower_count && (
                      <span className="text-xs text-muted-foreground">{formatCount(p.follower_count)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        {[
          { icon: Users, label: "Followers", value: formatCount(creator.follower_count), color: "text-blue-500" },
          { icon: Users, label: "Following", value: formatCount(creator.following_count), color: "text-indigo-500" },
          { icon: Heart, label: "Total Likes", value: formatCount(creator.total_likes), color: "text-pink-500" },
          { icon: Eye, label: "Avg Views", value: formatCount(creator.avg_views), color: "text-emerald-500" },
          { icon: TrendingUp, label: "Engagement", value: creator.engagement_rate ? `${creator.engagement_rate}%` : "—", color: "text-amber-500" },
          { icon: Video, label: "Videos", value: formatCount(creator.video_count), color: "text-purple-500" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            className="bg-card rounded-xl border border-border p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-lg sm:text-xl font-bold text-foreground">{stat.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Feed Grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-primary" /> Content Feed
            {feedItems.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({feedItems.length} videos)</span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 gap-1"
            onClick={() => fetchFeed(creator.username, creator.platform, getFeedLimit(creator.video_count), creator.id)}
            disabled={feedLoading}
          >
            <RefreshCw className={`w-3 h-3 ${feedLoading ? "animate-spin" : ""}`} /> Refresh Feed
          </Button>
        </div>

        {feedLoading && feedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Fetching videos from {creator.platform}...</p>
          </div>
        )}

        {!feedLoading && feedItems.length === 0 && (
          <div className="py-16 rounded-xl bg-secondary flex flex-col items-center justify-center gap-2">
            <Video className="w-8 h-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No feed content found yet</span>
          </div>
        )}

        {feedItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {feedItems.map((item, i) => (
              <FeedVideoCard
                key={item.url}
                item={item}
                index={i}
                onOpen={setActiveVideo}
                fallbackGradient={gradient}
              />
            ))}
          </div>
        )}

        {/* Video player overlay */}
        {activeVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm" onClick={() => setActiveVideo(null)}>
            <motion.div
              className="relative w-full max-w-sm mx-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setActiveVideo(null)}
                className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="rounded-2xl overflow-hidden bg-card shadow-elevated aspect-[9/16]">
                {activeVideo.embed_html ? (
                  <iframe
                    srcDoc={`
                      <!DOCTYPE html>
                      <html><head><style>*{margin:0;padding:0;overflow:hidden}body{background:#000}blockquote{max-width:100%!important;min-width:100%!important}</style></head>
                      <body>${activeVideo.embed_html.replace(/data-video-id="([^"]+)"/, 'data-video-id="$1" data-autoplay="1"')}<script async src="https://www.tiktok.com/embed.js"><\/script></body></html>
                    `}
                    className="w-full h-full border-0"
                    allow="autoplay; encrypted-media"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : activeVideo.url.includes("instagram.com") && getInstagramEmbedUrl(activeVideo.url) ? (
                  <iframe
                    src={getInstagramEmbedUrl(activeVideo.url)!}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary">
                    {activeVideo.thumbnail_url && (
                      <img src={activeVideo.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" loading="lazy" referrerPolicy="no-referrer" />
                    )}
                    <a
                      href={activeVideo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink className="w-4 h-4" /> Watch on {activeVideo.url.includes("instagram.com") ? "Instagram" : "TikTok"}
                    </a>
                  </div>
                )}
              </div>
              <div className="mt-3 text-center">
                <a
                  href={activeVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/70 hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> Open in {activeVideo.url.includes("instagram.com") ? "Instagram" : "TikTok"}
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Content Grid: Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Profile Details */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Profile Details
          </h3>
          <div className="space-y-3">
            {[
              { icon: Globe, label: "Platform", value: creator.platform },
              { icon: Clock, label: "Last Updated", value: timeAgo(creator.last_scraped_at) },
              { icon: Calendar, label: "First Seen", value: creator.created_at ? new Date(creator.created_at).toLocaleDateString() : "—" },
              { icon: Zap, label: "Source Query", value: creator.source_query || "—" },
              { icon: MapPin, label: "Location", value: creator.location || "Unknown" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </div>
                <span className="text-xs font-medium text-foreground capitalize">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Details */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Contact Details
          </h3>
          {contactItems.length > 0 ? (
            <div className="space-y-3">
              {contactItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <a
                    href={item.href}
                    target={item.href.startsWith("mailto:") ? undefined : "_blank"}
                    rel={item.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                    className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate max-w-[65%]"
                  >
                    {item.value}
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No contact details found yet. Try re-scanning.</p>
          )}
        </div>

        {/* Quick Assessment */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Quick Assessment
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Reach Score</span>
                <span className="text-xs font-medium text-foreground">
                  {creator.follower_count ? (creator.follower_count > 100000 ? "High" : creator.follower_count > 10000 ? "Medium" : "Emerging") : "—"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                  style={{ width: `${Math.min(100, ((creator.follower_count || 0) / 500000) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Data Completeness</span>
                <span className="text-xs font-medium text-foreground">
                  {[creator.follower_count, creator.bio, creator.thumbnail_url, creator.total_likes, creator.location].filter(Boolean).length * 20}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                  style={{ width: `${[creator.follower_count, creator.bio, creator.thumbnail_url, creator.total_likes, creator.location].filter(Boolean).length * 20}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Themes */}
        {creator.content_themes && creator.content_themes.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" /> Content Themes
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {creator.content_themes.map((t) => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-secondary text-foreground font-medium">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Niches */}
        {creator.niches && creator.niches.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" /> Detected Niches
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {creator.niches.map((n) => (
                <span key={n} className="text-xs px-2.5 py-1 rounded-lg bg-primary/8 text-primary font-medium">{n}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorProfilePage;
