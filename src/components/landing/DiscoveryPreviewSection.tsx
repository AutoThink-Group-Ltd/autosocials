import { useState, useEffect } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { motion } from "framer-motion";
import { Search, Heart, MapPin, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NicheExplorer } from "@/components/app/NicheExplorer";
import { supabase } from "@/integrations/supabase/client";

type PublicCreator = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  follower_count: number | null;
  engagement_rate: number | null;
  niches: string[] | null;
  location: string | null;
};

const fallbackColors = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-fuchsia-400 to-pink-500",
];

function formatCount(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function getPlatformIcon(platform: string) {
  if (platform === "tiktok") return "🎵";
  if (platform === "instagram") return "📸";
  return "🌐";
}

const DiscoveryPreviewSection = () => {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<PublicCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadCreators();
  }, []);

  async function loadCreators() {
    setLoading(true);
    const { data } = await supabase
      .from("creator_profiles")
      .select("id, platform, username, display_name, avatar_url, thumbnail_url, follower_count, engagement_rate, niches, location")
      .not("thumbnail_url", "is", null)
      .order("follower_count", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      setCreators(shuffled.slice(0, 12) as PublicCreator[]);
    }
    setLoading(false);
  }

  function handleNicheSelect(niche: string) {
    navigate(`/discover?q=${encodeURIComponent(niche)}`);
  }

  function handleSearch(query?: string) {
    const q = query || searchQuery;
    if (!q.trim()) return;
    navigate(`/discover?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <section className="py-24 md:py-36 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,hsl(var(--brand-pink)/0.04),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-8"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 block">Discovery feed</span>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            Browse creators like a{" "}
            <span className="gradient-brand-text">social feed</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Content-first discovery. Search by niche, see what creators actually post before reaching out.
          </p>
        </motion.div>

        {/* NicheExplorer — compact mode for landing */}
        <div className="max-w-2xl mx-auto mb-10">
          <NicheExplorer
            onNicheSelect={handleNicheSelect}
            onSearch={handleSearch}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            compact={false}
            showModes={false}
          />
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 max-w-6xl mx-auto">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
                <div className="aspect-[4/5] bg-secondary" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-secondary rounded w-3/4" />
                  <div className="h-3 bg-secondary rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Real creator cards */}
        {!loading && creators.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 max-w-6xl mx-auto">
              {creators.map((creator, i) => {
                const color = fallbackColors[i % fallbackColors.length];
                return (
                  <motion.div
                    key={creator.id}
                    className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-elevated hover:-translate-y-1 transition-all duration-200 group cursor-pointer"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    onClick={() => navigate(`/creator/${creator.id}`)}
                  >
                    <div className="aspect-[4/5] relative overflow-hidden">
                      {creator.thumbnail_url ? (
                        <img src={creator.thumbnail_url} alt={creator.display_name || creator.username} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${color}`} />
                      )}
                      <div className="absolute inset-0 bg-foreground/5" />
                      <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-card/90 backdrop-blur-sm rounded-md">
                        <span className="text-[10px]">{getPlatformIcon(creator.platform)}</span>
                        <span className="text-[10px] font-semibold text-foreground capitalize">{creator.platform}</span>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                        {creator.engagement_rate ? (
                          <div className="flex items-center gap-1 px-2 py-1 bg-card/90 backdrop-blur-sm rounded-md">
                            <Heart className="w-3 h-3 text-primary" />
                            <span className="text-[10px] font-medium text-foreground">{creator.engagement_rate}%</span>
                          </div>
                        ) : <div />}
                        <div className="px-2 py-1 bg-card/90 backdrop-blur-sm rounded-md">
                          <span className="text-[10px] font-medium text-foreground">{formatCount(creator.follower_count)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        {creator.avatar_url ? (
                          <img src={creator.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" loading="lazy" />
                        ) : (
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white text-xs font-bold">{(creator.display_name || creator.username)[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm text-foreground truncate">{creator.display_name || creator.username}</h4>
                          <p className="text-xs text-muted-foreground">@{creator.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        {creator.location ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">{creator.location}</span>
                          </div>
                        ) : <div />}
                        {creator.niches && creator.niches.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-primary font-medium">{creator.niches[0]}</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex justify-center mt-10">
              <Link to="/discover">
                <Button variant="outline" size="lg" className="gap-2 group">
                  Browse All Creators
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
            </div>
          </>
        )}

        {!loading && creators.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No creators discovered yet. Be the first to search!</p>
            <Link to="/discover">
              <Button variant="brand" className="gap-2">
                <Search className="w-4 h-4" /> Start Discovering
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default DiscoveryPreviewSection;
