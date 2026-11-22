import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, X, ChevronRight, ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Curated popular niches with categories (no emojis)
const CURATED_NICHES = [
  { label: "SaaS", category: "Tech" },
  { label: "Beauty", category: "Lifestyle" },
  { label: "Fitness", category: "Health" },
  { label: "Food & Cooking", category: "Lifestyle" },
  { label: "Fashion", category: "Lifestyle" },
  { label: "Gaming", category: "Entertainment" },
  { label: "Travel", category: "Lifestyle" },
  { label: "Finance", category: "Business" },
  { label: "Tech Reviews", category: "Tech" },
  { label: "Music", category: "Entertainment" },
  { label: "Parenting", category: "Family" },
  { label: "Pets", category: "Lifestyle" },
  { label: "DIY & Crafts", category: "Creative" },
  { label: "Education", category: "Education" },
  { label: "Real Estate", category: "Business" },
  { label: "Cars & Auto", category: "Lifestyle" },
  { label: "Comedy", category: "Entertainment" },
  { label: "Skincare", category: "Beauty" },
  { label: "Crypto & Web3", category: "Tech" },
  { label: "Photography", category: "Creative" },
  { label: "Mental Health", category: "Health" },
  { label: "Sports", category: "Sports" },
  { label: "Home Decor", category: "Lifestyle" },
  { label: "Startup", category: "Business" },
  { label: "Yoga & Wellness", category: "Health" },
  { label: "Unboxing", category: "Entertainment" },
  { label: "Marketing", category: "Business" },
  { label: "Streetwear", category: "Fashion" },
  { label: "ASMR", category: "Entertainment" },
  { label: "Sustainability", category: "Lifestyle" },
];

const CATEGORIES = ["All", "Tech", "Business", "Lifestyle", "Health", "Entertainment", "Creative", "Beauty", "Fashion", "Education", "Sports", "Family"];

const FOLLOWER_RANGES = [
  { label: "Any", min: undefined, max: undefined },
  { label: "1K – 10K", min: 1000, max: 10000 },
  { label: "10K – 50K", min: 10000, max: 50000 },
  { label: "50K – 100K", min: 50000, max: 100000 },
  { label: "100K – 500K", min: 100000, max: 500000 },
  { label: "500K – 1M", min: 500000, max: 1000000 },
  { label: "1M+", min: 1000000, max: undefined },
];

const ENGAGEMENT_RANGES = [
  { label: "Any", min: undefined },
  { label: "> 1%", min: 1 },
  { label: "> 3%", min: 3 },
  { label: "> 5%", min: 5 },
  { label: "> 10%", min: 10 },
];

export interface DiscoveryFilters {
  min_followers?: number;
  max_followers?: number;
  min_engagement_rate?: number;
  location?: string;
}

interface NicheExplorerProps {
  onNicheSelect: (niche: string) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isSearching?: boolean;
  compact?: boolean;
  platform?: string;
  onPlatformChange?: (platform: "tiktok" | "instagram") => void;
  searchMode?: "vibe" | "keyword" | "username" | "brand";
  onSearchModeChange?: (mode: "vibe" | "keyword" | "username" | "brand") => void;
  showModes?: boolean;
  filters?: DiscoveryFilters;
  onFiltersChange?: (filters: DiscoveryFilters) => void;
}

export function NicheExplorer({
  onNicheSelect,
  onSearch,
  searchQuery,
  onSearchQueryChange,
  isSearching = false,
  compact = false,
  platform = "tiktok",
  onPlatformChange,
  searchMode = "keyword",
  onSearchModeChange,
  showModes = true,
  filters,
  onFiltersChange,
}: NicheExplorerProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [dbNiches, setDbNiches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [nicheGridOpen, setNicheGridOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationInput, setLocationInput] = useState(filters?.location || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch dynamic niches from DB (limited query)
  useEffect(() => {
    async function fetchNiches() {
      const { data } = await supabase
        .from("creator_profiles")
        .select("niches")
        .not("niches", "is", null)
        .limit(500);

      if (data) {
        const allNiches = data.flatMap((d: any) => d.niches || []);
        const counts: Record<string, number> = {};
        allNiches.forEach((n: string) => {
          const key = n.toLowerCase().trim();
          counts[key] = (counts[key] || 0) + 1;
        });
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50)
          .map(([k]) => k);
        setDbNiches(sorted);
      }
    }
    fetchNiches();
  }, []);

  // Autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const curatedMatches = CURATED_NICHES
      .filter((n) => n.label.toLowerCase().includes(q))
      .map((n) => ({ label: n.label, source: "curated" as const }));

    const dbMatches = dbNiches
      .filter((n) => n.includes(q) && !curatedMatches.some((c) => c.label.toLowerCase() === n))
      .slice(0, 8)
      .map((n) => ({ label: n.charAt(0).toUpperCase() + n.slice(1), source: "db" as const }));

    return [...curatedMatches, ...dbMatches].slice(0, 10);
  }, [searchQuery, dbNiches]);

  const filteredNiches = activeCategory === "All"
    ? CURATED_NICHES
    : CURATED_NICHES.filter((n) => n.category === activeCategory);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleNicheClick(niche: string) {
    setSelectedNiche(niche);
    onSearchQueryChange(niche);
    onNicheSelect(niche);
    setShowSuggestions(false);
    setNicheGridOpen(false);
  }

  function handleSuggestionClick(label: string) {
    onSearchQueryChange(label);
    setSelectedNiche(label);
    setShowSuggestions(false);
    onNicheSelect(label);
  }

  function handleSubmit() {
    if (!searchQuery.trim()) return;
    onSearch(searchQuery);
    setShowSuggestions(false);
  }

  const hasActiveFilters = filters && (filters.min_followers || filters.max_followers || filters.min_engagement_rate || filters.location);

  return (
    <div className="w-full">
      {/* Search bar with autocomplete */}
      <div className="relative max-w-3xl mx-auto">
        {/* Mode + Platform toggles */}
        {showModes && (
          <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
            {/* Niche chip if selected */}
            {selectedNiche && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 mr-auto"
              >
                <span className="text-xs font-medium text-primary">{selectedNiche}</span>
                <button
                  onClick={() => { setSelectedNiche(null); onSearchQueryChange(""); }}
                  className="ml-0.5 hover:text-primary/70"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {onSearchModeChange && (
                <div className="flex items-center gap-0.5 p-0.5 bg-secondary rounded-lg">
                  <button
                    onClick={() => onSearchModeChange("vibe")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1 ${searchMode === "vibe" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Ask Vibe
                  </button>
                  <button
                    onClick={() => onSearchModeChange("keyword")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${searchMode === "keyword" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Keyword
                  </button>
                  <button
                    onClick={() => onSearchModeChange("username")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${searchMode === "username" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    @ Username
                  </button>
                  <button
                    onClick={() => onSearchModeChange("brand")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${searchMode === "brand" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Brand
                  </button>
                </div>
              )}
              {onPlatformChange && (
                <div className="flex items-center gap-0.5 p-0.5 bg-secondary rounded-lg">
                  <button
                    onClick={() => onPlatformChange("tiktok")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${platform === "tiktok" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    TikTok
                  </button>
                  <button
                    onClick={() => onPlatformChange("instagram")}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${platform === "instagram" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Instagram
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="flex items-center gap-2 p-1.5 bg-card rounded-xl border border-border shadow-soft focus-within:shadow-card focus-within:border-primary/20 transition-all">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchQueryChange(e.target.value);
                setShowSuggestions(true);
                if (selectedNiche) setSelectedNiche(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
              placeholder={
                searchMode === "vibe"
                  ? "Tell Vibe what you need... e.g. Find me creators to promote my SaaS product, my skincare brand, my fitness app..."
                  : searchMode === "username"
                    ? "e.g. @sarahcreates or sarahcreates"
                    : searchMode === "brand"
                      ? "e.g. perspective.io, notion.so, or any brand URL..."
                      : "Search by niche, topic, or keyword... e.g. SaaS, beauty, fitness"
              }
              className="w-full h-10 pl-9 pr-4 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden"
              disabled={isSearching}
            />
          </div>
          {onFiltersChange && (
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`inline-flex items-center justify-center rounded-lg h-8 w-8 transition-all ${
                hasActiveFilters
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSearching || !searchQuery.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg h-8 px-4 text-xs font-medium gradient-brand text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {isSearching ? (
              <div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : searchMode === "vibe" ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              <Search className="w-3 h-3" />
            )}
            {isSearching ? "Searching..." : searchMode === "vibe" ? "Ask Vibe" : "Discover"}
          </button>
        </div>

        {/* Filters panel */}
        <AnimatePresence>
          {filtersOpen && onFiltersChange && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden mt-2"
            >
              <div className="p-3 bg-card rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Filters</span>
                  {hasActiveFilters && (
                    <button
                      onClick={() => {
                        onFiltersChange({});
                        setLocationInput("");
                      }}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                
                {/* Follower range */}
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Followers</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {FOLLOWER_RANGES.map((range) => {
                      const isActive = filters?.min_followers === range.min && filters?.max_followers === range.max;
                      return (
                        <button
                          key={range.label}
                          onClick={() => onFiltersChange({
                            ...filters,
                            ...(range.min !== undefined ? { min_followers: range.min } : {}),
                            ...(range.max !== undefined ? { max_followers: range.max } : {}),
                          })}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all ${
                            isActive
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                          }`}
                        >
                          {range.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Engagement rate */}
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Engagement Rate</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {ENGAGEMENT_RANGES.map((range) => {
                      const isActive = filters?.min_engagement_rate === range.min;
                      return (
                        <button
                          key={range.label}
                          onClick={() => onFiltersChange({
                            ...filters,
                            ...(range.min !== undefined ? { min_engagement_rate: range.min } : {}),
                          })}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all ${
                            isActive
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
                          }`}
                        >
                          {range.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Location</span>
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    onBlur={() => { const loc = locationInput.trim(); onFiltersChange({ ...filters, ...(loc ? { location: loc } : {}) }); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const loc = locationInput.trim();
                        onFiltersChange({ ...filters, ...(loc ? { location: loc } : {}) });
                      }
                    }}
                    placeholder="e.g. United States, London, UK..."
                    className="w-full mt-1.5 h-8 px-3 text-xs bg-card border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-hidden focus:border-primary/30"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Autocomplete dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              ref={suggestionsRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border rounded-xl shadow-elevated z-50 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested niches
                </span>
              </div>
              {suggestions.map((s, i) => (
                <button
                  key={s.label + i}
                  onClick={() => handleSuggestionClick(s.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors text-left group"
                >
                  <span className="text-sm text-foreground font-medium flex-1">{s.label}</span>
                  {s.source === "db" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary font-medium">
                      Trending
                    </span>
                  )}
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Collapsible niche grid */}
      {!compact && searchMode === "keyword" && (
        <div className="mt-3 max-w-3xl mx-auto">
          <button
            onClick={() => setNicheGridOpen(!nicheGridOpen)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <span>{nicheGridOpen ? "Hide" : "Browse"} niches</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${nicheGridOpen ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {nicheGridOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3">
                  <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide pb-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-all ${
                          activeCategory === cat
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <motion.div className="flex flex-wrap gap-2" layout>
                    <AnimatePresence mode="popLayout">
                      {filteredNiches.map((niche) => (
                        <motion.button
                          key={niche.label}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => handleNicheClick(niche.label)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:-translate-y-0.5 hover:shadow-soft ${
                            selectedNiche === niche.label
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-card border-border text-foreground hover:border-primary/20"
                          }`}
                        >
                          {niche.label}
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </motion.div>

                  {dbNiches.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="w-3 h-3 text-primary" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Trending in your database
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dbNiches
                          .filter((n) => !CURATED_NICHES.some((c) => c.label.toLowerCase() === n))
                          .slice(0, 12)
                          .map((niche) => (
                            <button
                              key={niche}
                              onClick={() => handleNicheClick(niche.charAt(0).toUpperCase() + niche.slice(1))}
                              className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all hover:-translate-y-0.5 ${
                                selectedNiche?.toLowerCase() === niche
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/20"
                              }`}
                            >
                              {niche.charAt(0).toUpperCase() + niche.slice(1)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
