import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Search, Users, TrendingUp, Plus, Eye, Play, Heart, Sparkles, X, Globe, BarChart3, Tag, Loader2, RefreshCw, CheckSquare, Square, FolderPlus, ExternalLink, Shuffle, LayoutGrid, List, Send, MailX, BookmarkX, Zap, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { creatorsApi, type CreatorProfile, type PhylloCreator } from "@/lib/api/creators";
import { SaveToListPopover, type BulkCreatorData } from "@/components/app/SaveToListPopover";
import { NicheExplorer, type DiscoveryFilters } from "@/components/app/NicheExplorer";
import { useToast } from "@/components/ui/use-toast";
import VideoThumbnail, { VideoPlayerModal } from "@/components/app/VideoThumbnail";
import { CreatorTableView } from "@/components/app/CreatorTableView";
import { CreatorProfileSheet } from "@/components/app/CreatorProfileSheet";
import { BulkOutreachDialog, type OutreachCreator } from "@/components/app/BulkOutreachDialog";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { VibeModal } from "@/components/app/VibeModal";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";
import { useUsageGate } from "@/hooks/useUsageGate";
import { useUsageCounts } from "@/hooks/useUsageCounts";

function buildPhylloFilters(df: DiscoveryFilters, niches?: string[]): {
  niches?: string[];
  min_followers?: number;
  max_followers?: number;
  min_engagement_rate?: number;
  location?: string;
} {
  return {
    ...(niches !== undefined ? { niches } : {}),
    ...(df.min_followers !== undefined ? { min_followers: df.min_followers } : {}),
    ...(df.max_followers !== undefined ? { max_followers: df.max_followers } : {}),
    ...(df.min_engagement_rate !== undefined ? { min_engagement_rate: df.min_engagement_rate } : {}),
    ...(df.location !== undefined ? { location: df.location } : {}),
  };
}

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
  return platformColors[index % platformColors.length] ?? platformColors[0] ?? "";
}

function formatCount(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function formatEngagement(rate: number | null): string {
  if (!rate) return "";
  if (rate > 1) return `${rate.toFixed(1)}%`; // already percentage
  return `${(rate * 100).toFixed(1)}%`; // decimal to percentage
}

function formatLastPost(dateStr: string | null): { label: string; isRecent: boolean } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 1) return { label: "Today", isRecent: true };
  if (diffDays === 1) return { label: "Yesterday", isRecent: true };
  if (diffDays < 7) return { label: `${diffDays}d ago`, isRecent: true };
  if (diffDays < 30) return { label: `${Math.floor(diffDays / 7)}w ago`, isRecent: true };
  if (diffDays < 90) return { label: `${Math.floor(diffDays / 30)}mo ago`, isRecent: diffDays < 60 };
  if (diffDays < 365) return { label: `${Math.floor(diffDays / 30)}mo ago`, isRecent: false };
  return { label: `${Math.floor(diffDays / 365)}y ago`, isRecent: false };
}

function extractUrlExpiry(url: string | null): number | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const expiry = parsed.searchParams.get("x-expires");
    if (!expiry) return null;

    const asNumber = Number(expiry);
    return Number.isFinite(asNumber) ? asNumber : null;
  } catch {
    return null;
  }
}

function isExpiredSignedMediaUrl(url: string | null): boolean {
  const expiry = extractUrlExpiry(url);
  if (!expiry) return false;

  const now = Math.floor(Date.now() / 1000);
  return expiry <= now;
}

const DISCOVER_CACHE_KEY = "discover_cache";

function saveDiscoverCache(data: { query: string; platform: string; mode: string; creators: CreatorProfile[] }) {
  try {
    // Strip heavy raw_data to fit sessionStorage
    const light = {
      ...data,
      creators: data.creators.map(({ raw_data, ...rest }) => ({ ...rest, raw_data: null })),
    };
    sessionStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(light));
  } catch {}
}

function loadDiscoverCache(): { query: string; platform: string; mode: string; creators: CreatorProfile[] } | null {
  try {
    const raw = sessionStorage.getItem(DISCOVER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const DiscoverPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const cached = useRef(loadDiscoverCache());
  const prevPlatform = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(cached.current?.query || "");
  const [platform, setPlatform] = useState<"tiktok" | "instagram">((cached.current?.platform as any) || "tiktok");
  const [searchMode, setSearchMode] = useState<"vibe" | "keyword" | "username" | "brand">((cached.current?.mode as any) || "vibe");
  const [creators, setCreators] = useState<CreatorProfile[]>(cached.current?.creators || []);
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!cached.current?.creators?.length);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  // Selection is always-on — click thumbnails to select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterToSelected, setFilterToSelected] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [discoveryFilters, setDiscoveryFilters] = useState<DiscoveryFilters>({});
  // Pagination
  const [phylloOffset, setPhylloOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Exclude filters
  const [excludeContacted, setExcludeContacted] = useState(false);
  const [excludeSaved, setExcludeSaved] = useState(false);
  const [contactedEmails, setContactedEmails] = useState<Set<string>>(new Set());
  const [savedCreatorIds, setSavedCreatorIds] = useState<Set<string>>(new Set());
  const [drawerCreatorId, setDrawerCreatorId] = useState<string | null>(null);
  const { toast } = useToast();
  const handledQuery = useRef<string | null>(null);
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibeReasoning, setVibeReasoning] = useState<{ message: string; keywords: string[]; creator_types?: string[]; pro_tips?: string[] } | null>(null);
  const { checkLimit, upgradeDialogProps } = useUsageGate();
  const { counts: usageCounts, refetch: refetchUsage } = useUsageCounts();

  function handleVibeSearchKeyword(keyword: string) {
    setSearchQuery(keyword);
    handleSearch(keyword);
  }

  async function handleVibeSearchAll(keywords: string[]): Promise<number> {
    if (keywords.length === 0) return 0;
    // Search the first keyword immediately, then aggregate the rest
    setSearchQuery(keywords[0] ?? "");
    setIsSearching(true);
    setHasSearched(true);

    try {
      const allResults: CreatorProfile[] = [];
      const seenIds = new Set<string>();

      const addUnique = (items: any[]) => {
        for (const c of items) {
          const cid = c.id || c.phyllo_id || c.username;
          if (cid && !seenIds.has(cid)) {
            seenIds.add(cid);
            allResults.push(c);
          }
        }
      };

      // Process keywords in batches of 3 for speed
      const batchSize = 3;
      for (let i = 0; i < keywords.length; i += batchSize) {
        const batch = keywords.slice(i, i + batchSize);
        const batchPromises = batch.map(async (kw) => {
          try {
            // Always grab cached results
            const cachedResults = await creatorsApi.getCachedCreators({
              niches: [kw.toLowerCase()],
              platform,
              limit: 50,
            });
            addUnique(cachedResults);

            // Try Phyllo first
            const phylloResult = await creatorsApi.phylloSearch(kw, platform, 20, 0,
              buildPhylloFilters(discoveryFilters, [kw.toLowerCase()])
            );

            if (phylloResult.success && phylloResult.data?.length) {
              addUnique(phylloResult.data as any[]);
            } else {
              // Fallback to legacy discover when Phyllo fails
              const legacyResult = await creatorsApi.discover(kw, platform, 20, 'keyword');
              if (legacyResult.success && legacyResult.data?.length) {
                addUnique(legacyResult.data);
              }
            }
          } catch (err) {
            console.error(`Vibe search error for "${kw}":`, err);
          }
        });
        await Promise.all(batchPromises);
        // Update UI progressively
        setCreators([...allResults]);
      }

      setCreators(allResults);
      setSearchQuery(`Vibe: ${keywords.length} keywords`);
      toast({ title: "Vibe search complete", description: `Found ${allResults.length} creators across ${keywords.length} keywords` });
      return allResults.length;
    } catch (err) {
      console.error("Vibe search all error:", err);
      return 0;
    } finally {
      setIsSearching(false);
    }
  }

  async function handleVibeInlineSearch(query?: string) {
    const q = (query || searchQuery).trim();
    if (!q) return;

    setIsSearching(true);
    setHasSearched(true);
    setVibeReasoning(null);

    try {
      // Step 1: Ask Vibe for keywords
      const { data, error } = await supabase.functions.invoke("vibe-suggest", {
        body: {
          message: q,
          history: [],
          workspace: currentWorkspace
            ? {
                name: currentWorkspace.name,
                software_name: currentWorkspace.software_name,
                software_url: currentWorkspace.software_url,
                website: currentWorkspace.website,
                business_model: currentWorkspace.business_model,
              }
            : null,
        },
      });

      if (error) throw error;

      const vibeData = data as { message: string; keywords: string[]; creator_types?: string[]; pro_tips?: string[] };
      setVibeReasoning(vibeData);

      if (vibeData.keywords?.length) {
        // Step 2: Auto-search all keywords
        const resultCount = await handleVibeSearchAll(vibeData.keywords);

        // Step 3: Save to vibe_searches history
        if (currentWorkspace?.id && user?.id) {
          supabase.from("vibe_searches").insert({
            workspace_id: currentWorkspace.id,
            user_id: user.id,
            query: q,
            platform,
            message: vibeData.message || null,
            keywords: vibeData.keywords,
            creator_types: vibeData.creator_types || [],
            pro_tips: vibeData.pro_tips || [],
            results_count: resultCount || 0,
          }).then(() => {}); // fire-and-forget
        }
      } else {
        toast({ title: "No keywords found", description: "Vibe couldn't generate keywords. Try rephrasing.", variant: "destructive" });
        setIsSearching(false);
      }
    } catch (err: any) {
      console.error("Vibe inline error:", err);
      toast({ title: "Vibe error", description: err?.message || "Failed to get AI suggestions", variant: "destructive" });
      setIsSearching(false);
    }
  }

  const loadExclusionData = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    // First get workspace list IDs, then get all member creator_ids
    const [emailRes, listIdsRes] = await Promise.all([
      supabase
        .from("email_send_log")
        .select("to_email")
        .eq("workspace_id", currentWorkspace.id)
        .limit(5000),
      supabase
        .from("creator_lists")
        .select("id")
        .eq("workspace_id", currentWorkspace.id),
    ]);
    if (emailRes.data) {
      setContactedEmails(new Set(emailRes.data.map((r: any) => r.to_email?.toLowerCase()).filter(Boolean)));
    }
    if (listIdsRes.data && listIdsRes.data.length > 0) {
      const listIds = listIdsRes.data.map((l: any) => l.id);
      const { data: members } = await supabase
        .from("list_members")
        .select("creator_id")
        .in("list_id", listIds)
        .limit(5000);
      if (members) {
        setSavedCreatorIds(new Set(members.map((r: any) => r.creator_id)));
      }
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadExclusionData();
  }, [loadExclusionData]);

  useEffect(() => {
    // Always load recent profiles from DB as the default/fallback view
    loadCachedCreators();
    loadRecentSearches();
  }, []);

  // Persist search state so navigating back restores results
  useEffect(() => {
    if (hasSearched && creators.length > 0 && searchQuery) {
      saveDiscoverCache({
        query: searchQuery,
        platform,
        mode: searchMode,
        creators: creators.slice(0, 200), // cap to avoid storage limits
      });
    }
  }, [creators, searchQuery, platform, searchMode, hasSearched]);

  useEffect(() => {
    const q = searchParams.get("q");
    const mode = searchParams.get("mode");
    if (q && q !== handledQuery.current) {
      handledQuery.current = q;
      setSearchQuery(q);
      if (mode === "vibe") {
        setSearchMode("vibe");
        handleVibeInlineSearch(q);
      } else {
        handleSearch(q);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Re-search when platform changes and there's an active query
  useEffect(() => {
    if (prevPlatform.current !== null && prevPlatform.current !== platform && searchQuery.trim() && hasSearched) {
      handleSearch(searchQuery);
    }
    prevPlatform.current = platform;
  }, [platform]);

  async function loadCachedCreators() {
    const cached = await creatorsApi.getCachedCreators({ limit: 50 });
    if (cached.length > 0) {
      setCreators(cached);
      void refreshExpiredThumbnails(cached);
    }
  }

  async function loadRecentSearches() {
    const searches = await creatorsApi.getRecentSearches(20);
    const unique = [...new Set(searches.map((s: any) => s.query))].slice(0, 8);
    setRecentSearches(unique);
  }

  async function refreshExpiredThumbnails(cachedCreators: CreatorProfile[]) {
    const staleCreators = cachedCreators
      .filter((creator) => creator.thumbnail_url && isExpiredSignedMediaUrl(creator.thumbnail_url) && creator.latest_video_url)
      .slice(0, 12);

    if (staleCreators.length === 0) return;

    const refreshed = await Promise.all(
      staleCreators.map(async (creator) => {
        try {
          const result = await creatorsApi.fetchFeed(creator.username, creator.platform, 1);
          const firstWithThumb = result.success ? (result.data || []).find((item) => item.thumbnail_url) : null;
          if (!firstWithThumb?.thumbnail_url) return null;

          return {
            id: creator.id,
            thumbnail_url: firstWithThumb.thumbnail_url,
            latest_video_url: firstWithThumb.url || creator.latest_video_url,
          };
        } catch {
          return null;
        }
      })
    );

    const updates = new Map<string, { thumbnail_url: string; latest_video_url: string | null }>();

    for (const item of refreshed) {
      if (!item) continue;
      updates.set(item.id, {
        thumbnail_url: item.thumbnail_url,
        latest_video_url: item.latest_video_url,
      });
    }

    if (updates.size === 0) return;

    setCreators((prev) =>
      prev.map((creator) => {
        const update = updates.get(creator.id);
        if (!update) return creator;

        return {
          ...creator,
          thumbnail_url: update.thumbnail_url,
          latest_video_url: update.latest_video_url,
        };
      })
    );
  }

  async function handleSearch(query?: string, appendMode = false) {
    let q = (query || searchQuery).trim();
    if (!q) return;

    // Check search limit before executing
    if (!appendMode && !checkLimit("searches", usageCounts.searches)) return;

    // Detect Instagram/TikTok URLs and extract username
    const instaMatch = q.match(/(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9_.]+)/i);
    const tiktokMatch = q.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/i);
    if (instaMatch) {
      q = instaMatch[1] ?? "";
      setPlatform("instagram");
      setSearchMode("username");
      setSearchQuery(q);
    } else if (tiktokMatch) {
      q = tiktokMatch[1] ?? "";
      setPlatform("tiktok");
      setSearchMode("username");
      setSearchQuery(q);
    }

    if (!appendMode) {
      setIsSearching(true);
      setHasSearched(true);
      setPhylloOffset(0);
    } else {
      setIsLoadingMore(true);
    }

    const offset = appendMode ? phylloOffset : 0;

    try {
      // Run Phyllo + cached DB query in parallel for maximum results
      const [phylloResult, cachedResults] = await Promise.all([
        creatorsApi.phylloSearch(q, platform, 50, offset,
          buildPhylloFilters(discoveryFilters, searchMode === 'keyword' ? [q.toLowerCase()] : undefined)
        ),
        appendMode ? Promise.resolve([]) : creatorsApi.getCachedCreators({
          niches: [q.toLowerCase()],
          platform,
          limit: 200,
        }),
      ]);

      const creatorMap = new Map<string, CreatorProfile>();

      // If appending, seed with existing creators
      if (appendMode) {
        for (const c of creators) creatorMap.set(`${c.platform}:${c.username.toLowerCase()}`, c);
      }

      // Helper: keep whichever version has more data
      function mergeCreator(c: CreatorProfile) {
        const key = `${c.platform}:${c.username.toLowerCase()}`;
        const existing = creatorMap.get(key);
        if (!existing) {
          creatorMap.set(key, c);
        } else {
          const existingHasStats = !!(existing.follower_count && existing.follower_count > 0);
          const newHasStats = !!(c.follower_count && c.follower_count > 0);
          if (newHasStats && !existingHasStats) {
            creatorMap.set(key, { ...existing, ...c });
          } else if (existingHasStats && !newHasStats) {
            creatorMap.set(key, { ...c, ...existing });
          }
        }
      }

      // Track whether Phyllo has more pages
      let phylloHasMore = false;

      // Add Phyllo results
      if (phylloResult.success && phylloResult.data && phylloResult.data.length > 0) {
        phylloHasMore = phylloResult.meta?.has_more ?? phylloResult.data.length >= 50;
        const mapped: CreatorProfile[] = phylloResult.data.map((c, i) => ({
          id: c.phyllo_id || `phyllo-${offset + i}-${c.username}`,
          platform: c.platform,
          username: c.username,
          display_name: c.display_name,
          bio: c.bio,
          profile_url: c.profile_url,
          avatar_url: c.avatar_url,
          thumbnail_url: c.thumbnail_url || c.avatar_url,
          latest_video_url: null,
          latest_video_description: null,
          follower_count: c.follower_count,
          following_count: c.following_count,
          engagement_rate: c.engagement_rate,
          avg_views: c.avg_views,
          total_likes: c.total_likes,
          video_count: c.video_count,
          location: c.location,
          niches: c.niches || [],
          content_themes: c.content_themes || [],
          last_post_at: null,
          last_scraped_at: null,
          source_query: q,
          raw_data: c.raw_phyllo,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          contact_email: c.contact_email,
          contact_source: 'phyllo',
          website_url: c.website_url,
        }));

        for (const c of mapped) mergeCreator(c);
      } else if (!phylloResult.success && !appendMode) {
        console.warn('Phyllo search failed, falling back to legacy:', phylloResult.error);
      }

      // Add cached DB results (only on initial search)
      if (!appendMode) {
        for (const c of cachedResults) mergeCreator(c);
      }

      // Also run legacy Firecrawl discovery for more results (only on initial search)
      if (!appendMode) {
        const legacyMode = searchMode === "vibe" ? "keyword" : searchMode;
        const legacyResult = await creatorsApi.discover(q, platform, 100, legacyMode);

        if (legacyResult.success && legacyResult.data) {
          if (searchMode === 'username' && legacyResult.data.length >= 1 && creatorMap.size === 0 && legacyResult.data[0]) {
            navigate(`/app/creator/${legacyResult.data[0].id}`);
            return;
          }

          for (const c of legacyResult.data) mergeCreator(c);
        }
      }

      let allCreators = Array.from(creatorMap.values());
      setPhylloOffset(offset + 50);
      setHasMoreResults(phylloHasMore);

      if (allCreators.length > 0) {
        // Sort by follower count descending
        allCreators.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
        setCreators(allCreators);
        if (!appendMode) {
          toast({
            title: "Creators found",
            description: `${allCreators.length} creators found for "${q}"`,
          });
        } else {
          toast({
            title: "More results loaded",
            description: `Now showing ${allCreators.length} creators`,
          });
        }
        loadRecentSearches();
      } else if (!appendMode) {
        toast({
          title: "No results",
          description: "No creators found for this search",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Search error:", err);
      toast({
        title: "Error",
        description: "Failed to search. Check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }

  function loadMoreResults() {
    handleSearch(searchQuery, true);
  }

  function handleNicheSelect(niche: string) {
    handleSearch(niche);
  }

  function toggleBulkSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(creators.map(c => c.id)));
  }

  function selectRandom(count: number) {
    const shuffled = [...creators].sort(() => Math.random() - 0.5);
    const picked = new Set(shuffled.slice(0, count).map(c => c.id));
    setSelectedIds(picked);
    setFilterToSelected(true);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setFilterToSelected(false);
  }

  const visibleCreators = creators.filter(c => {
    if (c.platform !== platform) return false;
    if (filterToSelected && !selectedIds.has(c.id)) return false;
    if (excludeContacted && c.contact_email && contactedEmails.has(c.contact_email.toLowerCase())) return false;
    if (excludeSaved && savedCreatorIds.has(c.id)) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Discover Creators</h1>
          <p className="text-muted-foreground">Search 250M+ TikTok & Instagram creators — powered by Phyllo</p>
        </div>
      </div>

      {/* Niche Explorer replaces old search */}
      <div className="mb-6">
        <NicheExplorer
          onNicheSelect={handleNicheSelect}
          onSearch={(q) => {
            if (searchMode === "vibe") {
              handleVibeInlineSearch(q);
            } else {
              handleSearch(q);
            }
          }}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          isSearching={isSearching}
          platform={platform}
          onPlatformChange={setPlatform}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          showModes={true}
          filters={discoveryFilters}
          onFiltersChange={setDiscoveryFilters}
        />

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="flex items-center gap-2 mt-3 max-w-3xl mx-auto flex-wrap">
            <span className="text-[10px] text-muted-foreground/50">Recent:</span>
            {recentSearches.map((s) => (
              <button
                key={s}
                onClick={() => {
                  if (s.startsWith('brand:')) {
                    setSearchMode('brand');
                    const cleanQ = s.replace(/^brand:/, '');
                    setSearchQuery(cleanQ);
                    handleSearch(cleanQ);
                  } else {
                    setSearchQuery(s);
                    handleSearch(s);
                  }
                }}
                className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vibe reasoning banner */}
      <AnimatePresence>
        {vibeReasoning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6 p-4 rounded-xl border border-primary/20 bg-primary/5"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Vibe's reasoning</h3>
                  <button onClick={() => setVibeReasoning(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{vibeReasoning.message}</p>
                
                {vibeReasoning.keywords.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Keywords used</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {vibeReasoning.keywords.map((kw, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-primary/10 text-primary border border-primary/15">
                          <Tag className="w-2.5 h-2.5" />
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {vibeReasoning.creator_types && vibeReasoning.creator_types.length > 0 && (
                  <div className="mb-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Creator types</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {vibeReasoning.creator_types.map((ct, i) => (
                        <span key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-primary/20 py-0.5">{ct}</span>
                      ))}
                    </div>
                  </div>
                )}

                {vibeReasoning.pro_tips && vibeReasoning.pro_tips.length > 0 && (
                  <div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pro tips</span>
                    <div className="space-y-0.5 mt-1">
                      {vibeReasoning.pro_tips.map((tip, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">💡 {tip}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      {isSearching && creators.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-2xl gradient-brand flex items-center justify-center animate-pulse">
            <Search className="w-5 h-5 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Searching 250M+ creators on {platform}...</p>
          <p className="text-[11px] text-muted-foreground/50">This may take 10–20 seconds</p>
        </div>
      )}

      {/* Empty state with recovery suggestions */}
      {!isSearching && creators.length === 0 && hasSearched && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Search className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-foreground mb-1">No creators found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              Try adjusting your search or filters to find more creators
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setPlatform(platform === "tiktok" ? "instagram" : "tiktok");
                  handleSearch(searchQuery);
                }}
              >
                Try {platform === "tiktok" ? "Instagram" : "TikTok"} instead
              </Button>
              {(discoveryFilters.min_followers || discoveryFilters.max_followers || discoveryFilters.min_engagement_rate) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setDiscoveryFilters({});
                    handleSearch(searchQuery);
                  }}
                >
                  Clear filters & retry
                </Button>
              )}
              {searchMode !== "keyword" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setSearchMode("keyword");
                    handleSearch(searchQuery);
                  }}
                >
                  Search as keyword
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Initial empty state */}
      {!isSearching && creators.length === 0 && !hasSearched && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-foreground mb-1">Start discovering creators</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Click a niche above or type a search to find creators instantly
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {visibleCreators.length > 0 && (
        <div className="flex gap-6">
          <div className="flex-1">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">
                  {visibleCreators.length} creator{visibleCreators.length !== 1 ? "s" : ""} {filterToSelected ? "selected" : "found"}
                </p>
                {filterToSelected && (
                  <Button variant="link" size="sm" className="text-xs h-5 px-1 text-primary" onClick={() => setFilterToSelected(false)}>
                    Show all {creators.length}
                  </Button>
                )}
                {isSearching && (
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Finding more...
                  </div>
                )}
                {/* Exclude filters */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={excludeContacted ? "default" : "outline"}
                    size="sm"
                    className="text-[11px] h-6 gap-1 px-2"
                    onClick={() => setExcludeContacted(prev => !prev)}
                    title="Hide creators you've already emailed"
                  >
                    <MailX className="w-3 h-3" />
                    {excludeContacted ? "Hiding contacted" : "Hide contacted"}
                  </Button>
                  <Button
                    variant={excludeSaved ? "default" : "outline"}
                    size="sm"
                    className="text-[11px] h-6 gap-1 px-2"
                    onClick={() => setExcludeSaved(prev => !prev)}
                    title="Hide creators already saved to any list"
                  >
                    <BookmarkX className="w-3 h-3" />
                    {excludeSaved ? "Hiding saved" : "Hide saved"}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedIds.size > 0 && (
                  <SaveToListPopover
                    creatorId={Array.from(selectedIds)[0]!}
                    bulkCreatorIds={Array.from(selectedIds)}
                    bulkCreatorData={creators
                      .filter(c => selectedIds.has(c.id))
                      .map(c => ({
                        id: c.id,
                        platform: c.platform,
                        username: c.username,
                        display_name: c.display_name,
                        bio: c.bio,
                        profile_url: c.profile_url,
                        avatar_url: c.avatar_url,
                        thumbnail_url: c.thumbnail_url,
                        follower_count: c.follower_count,
                        engagement_rate: c.engagement_rate,
                        avg_views: c.avg_views,
                        total_likes: c.total_likes,
                        niches: c.niches,
                        website_url: c.website_url,
                      }))}
                    onBulkSaveComplete={() => { setSelectedIds(new Set()); setFilterToSelected(false); loadExclusionData(); }}
                    trigger={
                      <Button variant="brand" size="sm" className="text-xs h-7 gap-1.5">
                        <FolderPlus className="w-3 h-3" />
                        Save {selectedIds.size} to List
                      </Button>
                    }
                  />
                )}
                {selectedIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1.5"
                    onClick={() => setOutreachOpen(true)}
                  >
                    <Send className="w-3 h-3" />
                    Send to {selectedIds.size}
                  </Button>
                )}
                {selectedIds.size > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearSelection}>
                    Clear
                  </Button>
                )}
                <div className="hidden sm:flex items-center gap-2">
                  {visibleCreators.length > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectedIds.size === visibleCreators.length ? clearSelection : selectAll}>
                      {selectedIds.size === visibleCreators.length ? "Deselect All" : "Select All"}
                    </Button>
                  )}
                  {visibleCreators.length > 10 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1.5">
                          <Shuffle className="w-3 h-3" /> Random
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {[10, 20, 50, 100].filter(n => n <= visibleCreators.length).map(n => (
                          <DropdownMenuItem key={n} onClick={() => selectRandom(n)}>
                            Random {n}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={loadCachedCreators}>
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>
                {/* View toggle */}
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button
                    className={`p-1.5 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    className={`p-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "list" ? (
              <CreatorTableView
                creators={visibleCreators}
                selectedIds={selectedIds}
                onToggleSelect={toggleBulkSelect}
                onView={(id) => setDrawerCreatorId(id)}
              />
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleCreators.map((creator, i) => (
                <motion.div
                  key={creator.id}
                  className={`bg-card rounded-xl border overflow-hidden group transition-all duration-200 ${
                    selectedIds.has(creator.id)
                      ? "border-primary shadow-md ring-2 ring-primary/20"
                      : "border-border hover:shadow-elevated"
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {/* Thumbnail — click to select/deselect */}
                  <div
                    className={`aspect-[4/3] bg-gradient-to-br ${getColor(i)} relative overflow-hidden cursor-pointer`}
                    onClick={() => toggleBulkSelect(creator.id)}
                  >
                    <VideoThumbnail
                      thumbnailUrl={creator.thumbnail_url}
                      fallbackGradient={getColor(i)}
                      alt={creator.display_name || creator.username || ""}
                      videoUrl={creator.latest_video_url}
                      fallbackImageUrl={creator.avatar_url || (creator.platform === 'instagram' ? `https://unavatar.io/instagram/${encodeURIComponent(creator.username)}` : null)}
                    />
                    <div className="absolute inset-0 bg-foreground/5 pointer-events-none" />
                    {/* Selection indicator */}
                    <div className="absolute top-2.5 right-2.5 z-10">
                      {selectedIds.has(creator.id) ? (
                        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shadow-md">
                          <CheckSquare className="w-4 h-4 text-primary-foreground" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-card/70 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Square className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {creator.latest_video_url && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPlayingVideoUrl(creator.latest_video_url); }}
                        className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-foreground/70 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-foreground/90 z-10"
                      >
                        <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
                      </button>
                    )}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-card/90 backdrop-blur-sm rounded-md text-[10px] font-semibold text-foreground capitalize">
                      {creator.platform}
                    </div>
                  </div>

                  <div className="p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      {creator.avatar_url ? (
                        <img src={creator.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
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

                    <div className="flex items-center gap-1.5 mb-2 text-[11px] flex-wrap">
                      <span className="text-foreground font-medium">{formatCount(creator.follower_count)}</span>
                      <span className="text-muted-foreground">followers</span>
                      {creator.engagement_rate ? (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-emerald-500 font-medium">{formatEngagement(creator.engagement_rate)}</span>
                          <span className="text-muted-foreground">eng.</span>
                        </>
                      ) : null}
                      {creator.avg_views ? (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-foreground font-medium">{formatCount(creator.avg_views)}</span>
                          <span className="text-muted-foreground">avg views</span>
                        </>
                      ) : creator.total_likes ? (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-foreground font-medium">{formatCount(creator.total_likes)}</span>
                          <span className="text-muted-foreground">likes</span>
                        </>
                      ) : null}
                    </div>

                    {/* Last active indicator */}
                    {(() => {
                      const lastPost = formatLastPost(creator.last_post_at);
                      if (!lastPost) return null;
                      return (
                        <div className={`flex items-center gap-1 mb-2 text-[10px] ${lastPost.isRecent ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${lastPost.isRecent ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                          Active {lastPost.label}
                        </div>
                      );
                    })()}

                    {creator.niches && creator.niches.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mb-3">
                        {creator.niches.slice(0, 3).map((n) => (
                          <span key={n} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{n}</span>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-1.5 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-7 text-[10px] gap-1"
                        onClick={() => setDrawerCreatorId(creator.id)}
                      >
                        <Eye className="w-3 h-3" /> View Profile
                      </Button>
                      <SaveToListPopover
                        creatorId={creator.id}
                        onSaved={(ids) => setSavedCreatorIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s; })}
                        trigger={
                          savedCreatorIds.has(creator.id) ? (
                            <Button variant="brand" size="sm" className="h-7 text-[10px] gap-1 px-2">
                              <Check className="w-3 h-3" /> Saved
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 px-2">
                              <Plus className="w-3 h-3" /> Save
                            </Button>
                          )
                        }
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            )}

            {/* Load More button */}
            {hasMoreResults && !isLoadingMore && (
              <div className="flex justify-center pt-6 pb-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  onClick={loadMoreResults}
                >
                  <RefreshCw className="w-4 h-4" />
                  Load More Creators
                </Button>
              </div>
            )}
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading more creators...</span>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <AnimatePresence>
            {selectedCreator && (
              <motion.div
                className="w-[380px] flex-shrink-0 bg-card rounded-xl border border-border overflow-y-auto max-h-[calc(100vh-12rem)] sticky top-24"
                initial={{ opacity: 0, x: 20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 380 }}
                exit={{ opacity: 0, x: 20, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className={`h-28 bg-gradient-to-br ${getColor(creators.indexOf(selectedCreator))} relative`}>
                  <button
                    onClick={() => setSelectedCreator(null)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-card transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-5 -mt-8">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getColor(creators.indexOf(selectedCreator))} flex items-center justify-center border-4 border-card`}>
                    <span className="text-white font-bold text-2xl">{(selectedCreator.display_name || selectedCreator.username)[0]?.toUpperCase()}</span>
                  </div>
                </div>

                <div className="px-5 pt-3 pb-5">
                  <h2 className="text-lg font-bold text-foreground">{selectedCreator.display_name || selectedCreator.username}</h2>
                  <p className="text-sm text-muted-foreground mb-1">@{selectedCreator.username}</p>
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-primary/8 text-primary font-medium mb-4 capitalize">{selectedCreator.platform}</span>

                  {selectedCreator.bio && (
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{selectedCreator.bio}</p>
                  )}

                  <div className="space-y-3 mb-5">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-3 h-3 text-primary" /> Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-lg bg-secondary/60">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Users className="w-3 h-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground">Followers</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">{formatCount(selectedCreator.follower_count)}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/60">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Heart className="w-3 h-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground">Total Likes</span>
                        </div>
                        <span className="text-lg font-bold text-foreground">{formatCount(selectedCreator.total_likes)}</span>
                      </div>
                      {selectedCreator.engagement_rate && (
                        <div className="p-3 rounded-lg bg-secondary/60">
                          <div className="flex items-center gap-1.5 mb-1">
                            <TrendingUp className="w-3 h-3 text-primary" />
                            <span className="text-[10px] text-muted-foreground">Engagement</span>
                          </div>
                          <span className="text-lg font-bold text-foreground">{selectedCreator.engagement_rate}%</span>
                        </div>
                      )}
                      {selectedCreator.avg_views && (
                        <div className="p-3 rounded-lg bg-secondary/60">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Eye className="w-3 h-3 text-primary" />
                            <span className="text-[10px] text-muted-foreground">Avg Views</span>
                          </div>
                          <span className="text-lg font-bold text-foreground">{formatCount(selectedCreator.avg_views)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedCreator.niches.length > 0 && (
                    <div className="mb-5">
                      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <Tag className="w-3 h-3 text-primary" /> Detected Niches
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedCreator.niches.map((n) => (
                          <span key={n} className="text-xs px-2.5 py-1 rounded-lg bg-secondary text-foreground font-medium">{n}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-3 border-t border-border">
                    {selectedCreator.profile_url && (
                      <a href={selectedCreator.profile_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Button variant="brand" size="sm" className="w-full gap-1.5 text-xs">
                          <Globe className="w-3 h-3" /> View Profile
                        </Button>
                      </a>
                    )}
                    <SaveToListPopover creatorId={selectedCreator.id} trigger={
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
                        <Plus className="w-3 h-3" /> Save to List
                      </Button>
                    } />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {playingVideoUrl && (
        <VideoPlayerModal videoUrl={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />
      )}
      <BulkOutreachDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        creators={creators as unknown as OutreachCreator[]}
        selectedIds={selectedIds}
      />
      <VibeModal
        open={vibeOpen}
        onOpenChange={setVibeOpen}
        onSearchKeyword={handleVibeSearchKeyword}
        onSearchAll={handleVibeSearchAll}
      />
      <UpgradeDialog
        open={upgradeDialogProps.open}
        onOpenChange={upgradeDialogProps.onOpenChange}
        limitType={upgradeDialogProps.limitType}
        {...(upgradeDialogProps.currentUsage !== undefined ? { currentUsage: upgradeDialogProps.currentUsage } : {})}
        {...(upgradeDialogProps.currentLimit !== undefined ? { currentLimit: upgradeDialogProps.currentLimit } : {})}
      />
      <CreatorProfileSheet
        creatorId={drawerCreatorId}
        open={drawerCreatorId !== null}
        onOpenChange={(o) => { if (!o) setDrawerCreatorId(null); }}
        alreadySaved={drawerCreatorId ? savedCreatorIds.has(drawerCreatorId) : false}
        onSaved={(ids) => setSavedCreatorIds((prev) => {
          const s = new Set(prev);
          if (drawerCreatorId && ids.length > 0) s.add(drawerCreatorId);
          return s;
        })}
      />
    </div>
  );
};

export default DiscoverPage;
