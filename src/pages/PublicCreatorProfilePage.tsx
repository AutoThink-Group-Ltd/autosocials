import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { creatorsApi, type FeedItem } from "@/lib/api/creators";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Globe, Users, Heart, TrendingUp, Eye, Play, Tag,
  BarChart3, Clock, MapPin, Video, Calendar, Zap, ExternalLink,
  Loader2, RefreshCw, Grid3X3, Mail, X, UserPlus, Send, Star,
  ArrowRight, Lock, Sparkles, List, Plus, Check
} from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import { GuestListBar } from "@/components/app/GuestListBar";
import { useGuestLists } from "@/hooks/useGuestLists";
import { toast } from "sonner";

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
  raw_data: any;
  created_at: string;
  updated_at: string;
};

const platformColors = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
];

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

const SignupCTA = ({ label, icon: Icon, variant = "default" }: { label: string; icon: any; variant?: string }) => {
  const navigate = useNavigate();
  return (
    <Button
      variant={variant === "brand" ? "brand" : "outline"}
      size="sm"
      className="gap-1.5 text-xs"
      onClick={() => navigate("/pricing")}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </Button>
  );
};

const PublicCreatorProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<FeedItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const { addCreator, removeCreator, isInList } = useGuestLists();

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
      fetchFeed(data.username, data.platform);
    }
    setLoading(false);
  }

  async function fetchFeed(username: string, platform: string) {
    setFeedLoading(true);
    try {
      const result = await creatorsApi.fetchFeed(username, platform);
      if (result.success && result.data) {
        setFeedItems(result.data);
      }
    } catch (err) {
      console.error("Feed fetch failed:", err);
    } finally {
      setFeedLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[60vh] pt-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 pt-16">
          <p className="text-muted-foreground">Creator not found</p>
          <Button variant="outline" onClick={() => navigate("/discover")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Browse Creators
          </Button>
        </div>
      </div>
    );
  }

  const colorIdx = creator.username.charCodeAt(0) % platformColors.length;
  const gradient = platformColors[colorIdx];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 pb-16 max-w-6xl mx-auto px-6">
        {/* Back */}
        <button
          onClick={() => navigate("/discover")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Browse Creators
        </button>

        {/* Hero Card */}
        <motion.div
          className="bg-card rounded-2xl border border-border overflow-hidden mb-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Banner */}
          <div className="h-40 md:h-52 relative overflow-hidden">
            {feedItems.filter(i => i.thumbnail_url).length >= 3 ? (
              <div className="absolute inset-0 grid grid-cols-4 gap-0.5">
                {feedItems.filter(i => i.thumbnail_url).slice(0, 4).map((item) => (
                  <div key={item.url} className="relative overflow-hidden">
                    <img src={item.thumbnail_url!} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-foreground/10" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
            <div className="absolute top-4 left-4 px-3 py-1 bg-card/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-foreground capitalize">
              {creator.platform === "tiktok" ? "🎵 TikTok" : creator.platform === "instagram" ? "📸 Instagram" : creator.platform}
            </div>
          </div>

          {/* Profile */}
          <div className="px-6 md:px-8 -mt-12 relative z-10">
            <div className="flex items-end gap-5">
              {creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.display_name || creator.username}
                  className="w-24 h-24 rounded-2xl border-4 border-card object-cover shadow-elevated"
                />
              ) : (
                <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center border-4 border-card shadow-elevated`}>
                  <span className="text-white font-bold text-3xl">
                    {(creator.display_name || creator.username)[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 pb-2">
                <h1 className="text-2xl font-bold text-foreground">{creator.display_name || creator.username}</h1>
                <p className="text-muted-foreground">@{creator.username}</p>
              </div>
              {/* CTA Buttons */}
              <div className="flex gap-2 pb-2 flex-wrap">
                <SignupCTA label="Contact Creator" icon={Send} variant="brand" />
                {creator && (
                  <Button
                    variant={isInList(creator.id) ? "default" : "outline"}
                    size="sm"
                    className={`gap-1.5 text-xs ${isInList(creator.id) ? "gradient-brand text-primary-foreground" : ""}`}
                    onClick={() => {
                      if (isInList(creator.id)) {
                        removeCreator(creator.id);
                        toast.success("Removed from your list");
                      } else {
                        addCreator({
                          id: creator.id,
                          username: creator.username,
                          display_name: creator.display_name,
                          avatar_url: creator.avatar_url,
                          platform: creator.platform,
                          follower_count: creator.follower_count,
                          engagement_rate: creator.engagement_rate,
                          thumbnail_url: creator.thumbnail_url,
                          niches: creator.niches,
                        });
                        toast.success("Added to your list");
                      }
                    }}
                  >
                    {isInList(creator.id) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {isInList(creator.id) ? "Saved" : "Add to List"}
                  </Button>
                )}
                <SignupCTA label="Get Email" icon={Mail} />
              </div>
            </div>
          </div>

          {/* Bio + Tags */}
          <div className="px-6 md:px-8 pt-4 pb-6">
            {creator.bio && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-4">{creator.bio}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {creator.niches?.map((n) => (
                <span key={n} className="text-xs px-3 py-1 rounded-full bg-primary/8 text-primary font-medium">{n}</span>
              ))}
              {creator.location && (
                <span className="text-xs px-3 py-1 rounded-full bg-secondary text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {creator.location}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
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
            >
              <div className="flex items-center gap-1.5 mb-2">
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                <span className="text-[11px] text-muted-foreground">{stat.label}</span>
              </div>
              <span className="text-xl font-bold text-foreground">{stat.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Signup CTA Banner */}
        <motion.div
          className="bg-card rounded-2xl border border-primary/20 p-6 md:p-8 mb-6 relative overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_20%_20%,hsl(var(--brand-pink)/0.06),transparent)]" />
          <div className="relative flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Want to work with {creator.display_name || `@${creator.username}`}?</h3>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg">
                Get their contact details, send outreach messages, track collaborations, and manage creator relationships — all from one platform. Start free today.
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Link to="/pricing">
                <Button variant="brand" size="lg" className="gap-2 group">
                  Start Free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg">Sign In</Button>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Content Feed */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-primary" /> Content Feed
              {feedItems.filter(i => i.thumbnail_url).length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({feedItems.filter(i => i.thumbnail_url).length} posts)
                </span>
              )}
            </h2>
          </div>

          {feedLoading && feedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading content feed...</p>
            </div>
          )}

          {(() => {
            const withThumbnails = feedItems.filter(i => i.thumbnail_url);
            const visible = withThumbnails.slice(0, visibleCount);
            const hasMore = withThumbnails.length > visibleCount;

            return withThumbnails.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {visible.map((item, i) => (
                    <motion.div
                      key={item.url}
                      className="group relative aspect-[9/16] bg-card rounded-xl border border-border overflow-hidden hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setActiveVideo(item)}
                    >
                      <img
                        src={item.thumbnail_url!}
                        alt={item.title || 'Video thumbnail'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          {item.title && (
                            <p className="text-[11px] text-white font-medium line-clamp-2">{item.title}</p>
                          )}
                        </div>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-elevated">
                          <Play className="w-4 h-4 text-foreground ml-0.5" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setVisibleCount(prev => prev + 8)}
                    >
                      <Grid3X3 className="w-3.5 h-3.5" />
                      Load More ({withThumbnails.length - visibleCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            ) : !feedLoading ? (
              <div className="py-12 rounded-xl bg-secondary flex flex-col items-center justify-center gap-2">
                <Video className="w-8 h-8 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">No feed content available yet</span>
              </div>
            ) : null;
          })()}

          {/* Video modal */}
          {activeVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm" onClick={() => setActiveVideo(null)}>
              <motion.div
                className="relative w-full max-w-sm mx-4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => setActiveVideo(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
                <div className="rounded-2xl overflow-hidden bg-card shadow-elevated aspect-[9/16]">
                  {activeVideo.embed_html ? (
                    <iframe
                      srcDoc={`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;overflow:hidden}body{background:#000}blockquote{max-width:100%!important;min-width:100%!important}</style></head><body>${activeVideo.embed_html}<script async src="https://www.tiktok.com/embed.js"><\/script></body></html>`}
                      className="w-full h-full border-0"
                      allow="autoplay; encrypted-media"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary relative">
                      {activeVideo.thumbnail_url && (
                        <img src={activeVideo.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                      )}
                      <a
                        href={activeVideo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative z-10 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        <ExternalLink className="w-4 h-4" /> Watch Video
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </div>

        {/* Profile details + second CTA */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
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

          {/* Contact — gated */}
          <div className="bg-card rounded-xl border border-border p-5 relative overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Contact Details
            </h3>
            <div className="space-y-3 filter blur-sm select-none pointer-events-none">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Email</span>
                <span className="text-xs font-medium text-foreground">cr****@gmail.com</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Website</span>
                <span className="text-xs font-medium text-foreground">www.******.com</span>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-[2px]">
              <div className="text-center">
                <Lock className="w-5 h-5 text-primary mx-auto mb-2" />
                <p className="text-xs font-medium text-foreground mb-2">Sign up to unlock contacts</p>
                <Link to="/pricing">
                  <Button variant="brand" size="sm" className="text-xs gap-1">
                    <Sparkles className="w-3 h-3" /> Unlock Free
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Content Themes */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" /> Content Themes
            </h3>
            {creator.content_themes && creator.content_themes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {creator.content_themes.map((t) => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-secondary text-foreground font-medium">{t}</span>
                ))}
              </div>
            ) : creator.niches && creator.niches.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {creator.niches.map((n) => (
                  <span key={n} className="text-xs px-2.5 py-1 rounded-lg bg-primary/8 text-primary font-medium">{n}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No themes detected yet.</p>
            )}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="gradient-brand rounded-2xl p-8 md:p-12 text-center"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Ready to recruit {creator.display_name || `@${creator.username}`}?
          </h2>
          <p className="text-white/70 mb-6 max-w-lg mx-auto">
            Join thousands of brands using AutoSocials to discover, contact, and collaborate with creators at scale.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/pricing">
              <Button size="lg" className="bg-white text-black hover:bg-white/90 gap-2 font-semibold">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Floating guest list bar */}
      <GuestListBar />
    </div>
  );
};

export default PublicCreatorProfilePage;
