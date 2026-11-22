import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Heart, Sparkles, ArrowRight, Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
import { creatorsApi, type CreatorProfile } from "@/lib/api/creators";
import Navbar from "@/components/landing/Navbar";
import { GuestListBar } from "@/components/app/GuestListBar";
import { useGuestLists } from "@/hooks/useGuestLists";
import { NicheExplorer } from "@/components/app/NicheExplorer";
import { toast } from "sonner";

const platformColors = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
  "from-rose-400 to-pink-500",
  "from-fuchsia-400 to-purple-500",
  "from-indigo-400 to-blue-500",
];

function getColor(index: number) {
  return platformColors[index % platformColors.length];
}

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

const PublicDiscoverPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [platform, setPlatform] = useState<"tiktok" | "instagram">("tiktok");
  const [searchMode, setSearchMode] = useState<"keyword" | "username">("keyword");
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { addCreator, removeCreator, isInList } = useGuestLists();

  useEffect(() => {
    loadCachedCreators();
    const q = searchParams.get("q");
    if (q) {
      setSearchQuery(q);
      handleSearch(q);
    }
  }, []);

  async function loadCachedCreators() {
    const cached = await creatorsApi.getCachedCreators({ limit: 24 });
    if (cached.length > 0) {
      setCreators(cached);
    }
  }

  async function handleSearch(query?: string) {
    let q = (query || searchQuery).trim();
    if (!q) return;

    // Detect Instagram/TikTok URLs and extract username
    const instaMatch = q.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
    const tiktokMatch = q.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/i);
    if (instaMatch) {
      q = instaMatch[1] ?? q;
      setPlatform("instagram");
      setSearchMode("username");
      setSearchQuery(q);
    } else if (tiktokMatch) {
      q = tiktokMatch[1] ?? q;
      setPlatform("tiktok");
      setSearchMode("username");
      setSearchQuery(q);
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      // DB first
      const cached = await creatorsApi.getCachedCreators({
        niches: [q.toLowerCase()],
        limit: 24,
      });
      if (cached.length > 0) {
        setCreators(cached);
      }

      // Then live discover
      const result = await creatorsApi.discover(q, platform, 20, searchMode);
      if (result.success && result.data) {
        if (searchMode === "username" && result.data.length >= 1) {
          navigate(`/creator/${result.data[0]!.id}`);
          return;
        }
        const existingIds = new Set(cached.map(c => c.id));
        const newCreators = result.data.filter(c => !existingIds.has(c.id));
        setCreators([...cached, ...newCreators]);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  }

  function handleNicheSelect(niche: string) {
    handleSearch(niche);
  }

  function toggleSave(e: React.MouseEvent, creator: CreatorProfile) {
    e.stopPropagation();
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
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-24 max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-3">
            Discover <span className="gradient-brand-text">Creators</span>
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Search TikTok & Instagram for creators in any niche. Save them to your list — no account needed to browse.
          </p>
        </div>

        {/* Temporary list warning banner */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/6 border border-primary/10 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              <strong className="text-foreground">Build your shortlist for free</strong> — browse, search, and save creators. Sign up when you're ready to contact, export, or keep them permanently.
            </span>
          </div>
        </div>

        {/* NicheExplorer */}
        <div className="max-w-3xl mx-auto mb-10">
          <NicheExplorer
            onNicheSelect={handleNicheSelect}
            onSearch={handleSearch}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            isSearching={isSearching}
            platform={platform}
            onPlatformChange={setPlatform}
            searchMode={searchMode as any}
            onSearchModeChange={(m) => setSearchMode(m as any)}
            showModes={true}
          />
        </div>

        {/* Loading */}
        {isSearching && creators.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-2xl gradient-brand flex items-center justify-center animate-pulse">
              <Search className="w-5 h-5 text-primary-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Searching {platform} for creators...</p>
            <p className="text-[11px] text-muted-foreground/50">This may take 10–20 seconds</p>
          </div>
        )}

        {/* Results */}
        {creators.filter(c => c.avatar_url || c.thumbnail_url).length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {creators.filter(c => c.avatar_url || c.thumbnail_url).length} creators
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {creators.filter(c => c.avatar_url || c.thumbnail_url).map((creator, i) => {
                const saved = isInList(creator.id);
                return (
                  <motion.div
                    key={creator.id}
                    className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-elevated hover:-translate-y-1 transition-all duration-200 cursor-pointer group relative"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(`/creator/${creator.id}`)}
                  >
                    <button
                      onClick={(e) => toggleSave(e, creator)}
                      className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                        saved
                          ? "gradient-brand text-primary-foreground shadow-md"
                          : "bg-card/90 backdrop-blur-sm text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {saved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>

                    <div className="aspect-[4/5] relative overflow-hidden">
                      {creator.thumbnail_url ? (
                        <img src={creator.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getColor(i)}`} />
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

                    <div className="p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        {creator.avatar_url ? (
                          <img src={creator.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" loading="lazy" />
                        ) : (
                          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getColor(i)} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white text-[10px] font-bold">{(creator.display_name || creator.username)[0]?.toUpperCase()}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-foreground text-xs truncate">{creator.display_name || creator.username}</h3>
                          <p className="text-[11px] text-muted-foreground">@{creator.username}</p>
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

            {/* CTA */}
            <motion.div
              className="mt-12 gradient-brand rounded-2xl p-8 md:p-10 text-center"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">
                Ready to take action on your list?
              </h2>
              <p className="text-white/70 mb-5 max-w-md mx-auto text-sm">
                Create a free account to permanently save your creators, export lists, and start outreach campaigns.
              </p>
              <div className="flex justify-center gap-3">
                <Link to="/auth">
                  <Button size="lg" className="bg-white text-foreground hover:bg-white/90 gap-2 font-semibold">
                    Sign Up Free <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          </>
        )}

        {/* Empty state */}
        {!isSearching && creators.length === 0 && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground mb-1">Start discovering creators</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Click a niche above or search by keyword to find creators instantly.
              </p>
            </div>
          </div>
        )}
      </div>

      <GuestListBar />
    </div>
  );
};

export default PublicDiscoverPage;
