import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { creatorsApi, type FeedItem } from "@/lib/api/creators";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

import {
  Users, Heart, TrendingUp, Eye, Play, Tag, BarChart3,
  MapPin, Video, Zap, ExternalLink, Loader2, Grid3X3,
  Mail, X, Send, ArrowRight, Lock, Sparkles, List,
  Globe, BookOpen, Target, Lightbulb, Star, MessageSquare,
  Calendar, Award
} from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

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

type PageData = {
  ai_summary: string | null;
  ai_content_topics: string[];
  ai_audience_interests: string[];
  ai_collaboration_notes: string | null;
  page_title: string | null;
  meta_description: string | null;
};

type SimilarCreator = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  niches: string[];
};

function formatCount(n: number | null): string {
  if (n === null || n === undefined) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const platformEmoji: Record<string, string> = {
  tiktok: "🎵",
  instagram: "📸",
  youtube: "🎬",
  facebook: "📘",
};

const platformLabel: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
};

const GatedActionButton = ({ label, icon: Icon, variant = "outline" }: { label: string; icon: any; variant?: string }) => {
  const navigate = useNavigate();
  return (
    <Button
      variant={variant === "brand" ? "brand" : "outline"}
      size="sm"
      className="gap-1.5 text-xs"
      onClick={() => navigate("/auth?redirect=/app")}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </Button>
  );
};

const SEOCreatorProfilePage = () => {
  const { platform, username } = useParams<{ platform: string; username: string }>();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<FeedItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [similarCreators, setSimilarCreators] = useState<SimilarCreator[]>([]);

  useEffect(() => {
    if (platform && username) loadCreator(platform, username);
  }, [platform, username]);

  async function loadCreator(plat: string, uname: string) {
    setLoading(true);

    // Load creator profile
    const { data: creatorData } = await supabase
      .from("creator_profiles")
      .select("*")
      .eq("platform", plat)
      .eq("username", uname)
      .single();

    if (!creatorData) {
      setLoading(false);
      return;
    }

    const profile = creatorData as unknown as CreatorProfile;
    setCreator(profile);

    // Load page data (AI content)
    const { data: page } = await supabase
      .from("public_creator_pages" as any)
      .select("ai_summary, ai_content_topics, ai_audience_interests, ai_collaboration_notes, page_title, meta_description")
      .eq("platform", plat)
      .eq("username", uname)
      .eq("status", "published")
      .single();

    if (page) {
      setPageData(page as unknown as PageData);
    }

    // Track page view
    await supabase
      .from("public_creator_pages" as any)
      .update({ page_views: (page as any)?.page_views ? (page as any).page_views + 1 : 1, last_viewed_at: new Date().toISOString() } as any)
      .eq("platform", plat)
      .eq("username", uname);

    // Load similar creators (same platform, similar niches)
    const niches = profile.niches || [];
    const { data: similar } = await supabase
      .from("creator_profiles")
      .select("id, platform, username, display_name, avatar_url, follower_count, niches")
      .eq("platform", plat)
      .neq("username", uname)
      .not("avatar_url", "is", null)
      .limit(6);

    if (similar) {
      setSimilarCreators(similar as unknown as SimilarCreator[]);
    }

    // Fetch feed
    fetchFeed(profile.username, profile.platform);
    setLoading(false);
  }

  async function fetchFeed(uname: string, plat: string) {
    setFeedLoading(true);
    try {
      const result = await creatorsApi.fetchFeed(uname, plat);
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
            Browse Creators
          </Button>
        </div>
      </div>
    );
  }

  const displayName = creator.display_name || creator.username;
  const platLabel = platformLabel[creator.platform] || creator.platform;
  const platEmoji = platformEmoji[creator.platform] || "🌐";

  const seoTitle = pageData?.page_title ||
    `${displayName} ${platLabel} Creator Profile | Followers, Engagement & Creator Insights`;
  const seoDescription = pageData?.meta_description ||
    `Discover ${displayName} (@${creator.username}) on ${platLabel}. View follower stats, engagement rate, content themes, and collaboration potential. Find and connect with creators on AutoSocials.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: displayName,
    alternateName: `@${creator.username}`,
    url: `https://autosocials.com/${creator.platform}/${creator.username}`,
    image: creator.avatar_url,
    description: pageData?.ai_summary || creator.bio,
    sameAs: creator.profile_url ? [creator.profile_url] : [],
    interactionStatistic: [
      creator.follower_count ? {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/FollowAction",
        userInteractionCount: creator.follower_count
      } : null,
      creator.total_likes ? {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: creator.total_likes
      } : null
    ].filter(Boolean)
  };

  const gradients = [
    "from-pink-400 to-rose-500",
    "from-violet-400 to-purple-500",
    "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500",
    "from-cyan-400 to-blue-500",
  ];
  const gradient = gradients[creator.username.charCodeAt(0) % gradients.length];

  const stats = [
    creator.follower_count ? { icon: Users, label: "Followers", value: formatCount(creator.follower_count), color: "text-blue-500" } : null,
    creator.following_count ? { icon: Users, label: "Following", value: formatCount(creator.following_count), color: "text-indigo-500" } : null,
    creator.total_likes ? { icon: Heart, label: "Total Likes", value: formatCount(creator.total_likes), color: "text-pink-500" } : null,
    creator.avg_views ? { icon: Eye, label: "Avg Views", value: formatCount(creator.avg_views), color: "text-emerald-500" } : null,
    creator.engagement_rate ? { icon: TrendingUp, label: "Engagement Rate", value: `${creator.engagement_rate}%`, color: "text-amber-500" } : null,
    creator.video_count ? { icon: Video, label: "Videos", value: formatCount(creator.video_count), color: "text-purple-500" } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string; color: string }[];

  const contentTopics = pageData?.ai_content_topics?.length ? pageData.ai_content_topics :
    (creator.niches?.length ? creator.niches : creator.content_themes || []);

  const audienceInterests = pageData?.ai_audience_interests || [];

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta */}
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={`https://autosocials.com/${creator.platform}/${creator.username}`} />
      
      {/* Open Graph */}
      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:type" content="profile" />
      <meta property="og:url" content={`https://autosocials.com/${creator.platform}/${creator.username}`} />
      {(creator.avatar_url || creator.thumbnail_url) && <meta property="og:image" content={(creator.avatar_url || creator.thumbnail_url || '').replace(/&amp;/g, '&')} />}
      
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Navbar />

      <main className="pt-20 pb-16">
        <div className="max-w-5xl mx-auto px-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6" aria-label="Breadcrumb">
            <Link to="/discover" className="hover:text-foreground transition-colors">Creators</Link>
            <span>/</span>
            <Link to={`/discover?platform=${creator.platform}`} className="hover:text-foreground transition-colors capitalize">{platLabel}</Link>
            <span>/</span>
            <span className="text-foreground font-medium">@{creator.username}</span>
          </nav>

          {/* ═══════════════ HERO SECTION ═══════════════ */}
          <motion.section
            className="bg-card rounded-2xl border border-border overflow-hidden mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            aria-label="Creator profile"
          >
            {/* Banner */}
            <div className="h-44 md:h-56 relative overflow-hidden">
              {feedItems.filter(i => i.thumbnail_url).length >= 3 ? (
                <div className="absolute inset-0 grid grid-cols-4 gap-0.5">
                  {feedItems.filter(i => i.thumbnail_url).slice(0, 4).map((item) => (
                    <div key={item.url} className="relative overflow-hidden">
                      <img src={item.thumbnail_url!} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 bg-foreground/10" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
              <div className="absolute top-4 left-4 px-3 py-1.5 bg-card/90 backdrop-blur-sm rounded-lg text-xs font-semibold text-foreground capitalize">
                {platEmoji} {platLabel}
              </div>
            </div>

            {/* Profile info */}
            <div className="px-6 md:px-8 -mt-14 relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                {(creator.avatar_url || creator.thumbnail_url) ? (
                  <img
                    src={(creator.avatar_url || creator.thumbnail_url || '').replace(/&amp;/g, '&')}
                    alt={`${displayName} profile photo`}
                    className="w-28 h-28 rounded-2xl border-4 border-card object-cover shadow-lg"
                    loading="eager"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                  />
                ) : null}
                {!(creator.avatar_url || creator.thumbnail_url) && (
                  <div className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center border-4 border-card shadow-lg`}>
                    <span className="text-white font-bold text-4xl">
                      {displayName[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 pb-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">{displayName}</h1>
                  <p className="text-muted-foreground text-sm">@{creator.username} · {platLabel} Creator</p>
                  {creator.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {creator.location}
                    </p>
                  )}
                </div>
                {/* Primary CTAs */}
                <div className="flex gap-2 pb-2 flex-wrap">
                  <GatedActionButton label="Contact Creator" icon={Send} variant="brand" />
                  <GatedActionButton label="Add to List" icon={List} />
                  <GatedActionButton label="Get Email" icon={Mail} />
                </div>
              </div>
            </div>

            {/* Bio + Tags */}
            <div className="px-6 md:px-8 pt-4 pb-6">
              {creator.bio && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mb-4">{creator.bio}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {contentTopics.map((n) => (
                  <span key={n} className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">{n}</span>
                ))}
              </div>
            </div>
          </motion.section>

          {/* ═══════════════ METRICS ═══════════════ */}
          {stats.length > 0 && (
            <section className="mb-8" aria-label="Creator statistics">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Creator Metrics
              </h2>
              <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${Math.min(stats.length, 6)} gap-3`}>
                {stats.map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    className="bg-card rounded-xl border border-border p-4"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                      <span className="text-[11px] text-muted-foreground">{stat.label}</span>
                    </div>
                    <span className="text-xl font-bold text-foreground">{stat.value}</span>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* ═══════════════ AI SUMMARY (SEO/GEO) ═══════════════ */}
          {pageData?.ai_summary && (
            <motion.section
              className="bg-card rounded-2xl border border-border p-6 md:p-8 mb-8"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              aria-label="Creator overview"
            >
              <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" /> Creator Overview
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {pageData.ai_summary}
              </p>
            </motion.section>
          )}

          {/* ═══════════════ INSIGHTS GRID ═══════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Content Topics */}
            {contentTopics.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" /> Content Topics
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {contentTopics.map((t) => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-lg bg-primary/8 text-primary font-medium">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Audience Interests */}
            {audienceInterests.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Audience Interests
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {audienceInterests.map((a) => (
                    <span key={a} className="text-xs px-2.5 py-1 rounded-lg bg-accent text-accent-foreground font-medium">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Engagement Insights */}
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Engagement Insights
              </h3>
              <div className="space-y-3">
                {creator.engagement_rate && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Engagement Strength</span>
                      <span className="text-xs font-medium text-foreground">
                        {creator.engagement_rate > 5 ? "Excellent" : creator.engagement_rate > 2 ? "Strong" : creator.engagement_rate > 1 ? "Average" : "Growing"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${Math.min(100, creator.engagement_rate * 10)}%` }} />
                    </div>
                  </div>
                )}
                {creator.follower_count && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Creator Tier</span>
                      <span className="text-xs font-medium text-foreground">
                        {creator.follower_count > 1_000_000 ? "Mega" : creator.follower_count > 100_000 ? "Macro" : creator.follower_count > 10_000 ? "Mid-tier" : creator.follower_count > 1_000 ? "Micro" : "Nano"}
                      </span>
                    </div>
                  </div>
                )}
                {creator.video_count && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Content Volume</span>
                    <span className="text-xs font-medium text-foreground">{formatCount(creator.video_count)} posts</span>
                  </div>
                )}
              </div>
            </div>

            {/* Collaboration Potential */}
            {pageData?.ai_collaboration_notes && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" /> Collaboration Potential
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{pageData.ai_collaboration_notes}</p>
              </div>
            )}

            {/* Contact - Gated */}
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
                  <Link to="/auth?redirect=/app">
                    <Button variant="brand" size="sm" className="text-xs gap-1">
                      <Sparkles className="w-3 h-3" /> Unlock Free
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ CONTENT PREVIEW ═══════════════ */}
          <section className="mb-8" aria-label="Content feed">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-primary" /> Recent Content
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
                        className="group relative aspect-[9/16] bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setActiveVideo(item)}
                      >
                        <img
                          src={item.thumbnail_url!}
                          alt={item.title || `${displayName} content`}
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
                          <div className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                            <Play className="w-4 h-4 text-foreground ml-0.5" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center mt-4">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setVisibleCount(prev => prev + 8)}>
                        <Grid3X3 className="w-3.5 h-3.5" />
                        Load More ({withThumbnails.length - visibleCount} remaining)
                      </Button>
                    </div>
                  )}
                </>
              ) : !feedLoading ? (
                <div className="py-12 rounded-xl bg-secondary flex flex-col items-center justify-center gap-2">
                  <Video className="w-8 h-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Content preview not available</span>
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
                  <div className="rounded-2xl overflow-hidden bg-card shadow-lg aspect-[9/16]">
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
          </section>

          {/* ═══════════════ CONVERSION SECTION ═══════════════ */}
          <motion.section
            className="bg-card rounded-2xl border border-primary/20 p-6 md:p-8 mb-8 relative overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            aria-label="Get started with AutoSocials"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_20%_20%,hsl(var(--brand-pink)/0.06),transparent)]" />
            <div className="relative flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">Want to work with {displayName}?</h2>
                </div>
                <p className="text-sm text-muted-foreground max-w-lg mb-4">
                  AutoSocials makes it easy for brands and agencies to discover, contact, and manage creator collaborations.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-primary" /> Find creator contact details</li>
                  <li className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-primary" /> Send outreach messages</li>
                  <li className="flex items-center gap-2"><List className="w-3.5 h-3.5 text-primary" /> Organise creator lists</li>
                  <li className="flex items-center gap-2"><Award className="w-3.5 h-3.5 text-primary" /> Manage collaborations</li>
                </ul>
              </div>
              <div className="flex flex-col gap-3 flex-shrink-0">
                <Link to="/auth?redirect=/app">
                  <Button variant="brand" size="lg" className="gap-2 group w-full">
                    Start Free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button variant="outline" size="lg" className="w-full">Sign In</Button>
                </Link>
              </div>
            </div>
          </motion.section>

          {/* ═══════════════ SIMILAR CREATORS ═══════════════ */}
          {similarCreators.length > 0 && (
            <section className="mb-8" aria-label="Similar creators">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" /> Similar Creators
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {similarCreators.map((c) => (
                  <Link
                    key={c.id}
                    to={`/${c.platform}/${c.username}`}
                    className="bg-card rounded-xl border border-border p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-center group"
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt={c.display_name || c.username}
                        className="w-14 h-14 rounded-xl object-cover mx-auto mb-2"
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradients[c.username.charCodeAt(0) % gradients.length]} flex items-center justify-center mx-auto mb-2`}>
                        <span className="text-white font-bold text-lg">{(c.display_name || c.username)[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {c.display_name || c.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground">@{c.username}</p>
                    {c.follower_count && (
                      <p className="text-[10px] text-muted-foreground mt-1">{formatCount(c.follower_count)} followers</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ═══════════════ BOTTOM CTA ═══════════════ */}
          <motion.section
            className="gradient-brand rounded-2xl p-8 md:p-12 text-center"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Find & recruit top creators
            </h2>
            <p className="text-white/70 mb-6 max-w-lg mx-auto">
              Join thousands of brands using AutoSocials to discover creators, run outreach campaigns, and manage collaborations at scale.
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/auth?redirect=/app">
                <Button size="lg" className="bg-white text-black hover:bg-white/90 gap-2 font-semibold">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </motion.section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SEOCreatorProfilePage;
