import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Loader2, Database, Search, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SourceStat = { source: string; count: number; percentage: number };
type PlatformStat = { platform: string; count: number };

export default function DataSourcesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-data-sources"],
    queryFn: async () => {
      // Fetch contact_source distribution
      const profiles = await fetchAll<{ contact_source: string | null; platform: string | null }>((a, b) =>
        supabase.from("creator_profiles").select("contact_source, platform").order("id").range(a, b));
      const totalCount = profiles.length;

      // Fetch search query stats
      const searches = await fetchAll<{ platform: string; result_count: number | null }>((a, b) =>
        supabase.from("search_queries").select("platform, result_count").order("id").range(a, b));
      const searchCount = searches.length;

      // Fetch creators with/without emails
      const { count: withEmail } = await supabase
        .from("creator_profiles")
        .select("id", { count: "exact", head: true })
        .not("contact_email", "is", null);

      // Fetch creators with/without thumbnails
      const { count: withThumb } = await supabase
        .from("creator_profiles")
        .select("id", { count: "exact", head: true })
        .not("thumbnail_url", "is", null);

      // Aggregate contact_source
      const sourceCounts = new Map<string, number>();
      const platformCounts = new Map<string, number>();
      let noSource = 0;

      for (const p of profiles || []) {
        const src = p.contact_source || "none";
        if (src === "none") noSource++;
        sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
        const plat = p.platform || "unknown";
        platformCounts.set(plat, (platformCounts.get(plat) || 0) + 1);
      }

      const total = totalCount || 0;
      const sources: SourceStat[] = [...sourceCounts.entries()]
        .map(([source, count]) => ({ source, count, percentage: total ? Math.round((count / total) * 100) : 0 }))
        .sort((a, b) => b.count - a.count);

      const platforms: PlatformStat[] = [...platformCounts.entries()]
        .map(([platform, count]) => ({ platform, count }))
        .sort((a, b) => b.count - a.count);

      // Search platform breakdown
      const searchPlatforms = new Map<string, number>();
      let totalSearchResults = 0;
      for (const s of searches || []) {
        searchPlatforms.set(s.platform, (searchPlatforms.get(s.platform) || 0) + 1);
        totalSearchResults += s.result_count || 0;
      }

      return {
        totalCreators: total,
        withEmail: withEmail || 0,
        withThumbnail: withThumb || 0,
        noSource,
        sources,
        platforms,
        totalSearches: searchCount || 0,
        totalSearchResults,
        searchPlatforms: [...searchPlatforms.entries()].map(([p, c]) => ({ platform: p, count: c })).sort((a, b) => b.count - a.count),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const sourceColors: Record<string, string> = {
    phyllo: "bg-violet-500",
    scraped: "bg-emerald-500",
    bio_regex: "bg-blue-500",
    firecrawl: "bg-orange-500",
    firecrawl_search: "bg-amber-500",
    gemini: "bg-pink-500",
    manual: "bg-cyan-500",
    none: "bg-muted-foreground/30",
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: Database, label: "Total Creators", value: data.totalCreators.toLocaleString(), color: "text-blue-500" },
          { icon: Users, label: "With Email", value: `${data.withEmail.toLocaleString()} (${data.totalCreators ? Math.round((data.withEmail / data.totalCreators) * 100) : 0}%)`, color: "text-emerald-500" },
          { icon: TrendingUp, label: "With Thumbnail", value: `${data.withThumbnail.toLocaleString()} (${data.totalCreators ? Math.round((data.withThumbnail / data.totalCreators) * 100) : 0}%)`, color: "text-purple-500" },
          { icon: Search, label: "Total Searches", value: data.totalSearches.toLocaleString(), color: "text-amber-500" },
          { icon: AlertTriangle, label: "No Source", value: `${data.noSource.toLocaleString()} (${data.totalCreators ? Math.round((data.noSource / data.totalCreators) * 100) : 0}%)`, color: "text-destructive" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-lg font-bold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Contact Source Distribution */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Email Source Distribution
          </h3>
          <div className="space-y-3">
            {data.sources.map((s) => (
              <div key={s.source} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${sourceColors[s.source] || "bg-muted-foreground"}`} />
                    <span className="font-medium text-foreground capitalize">{s.source === "none" ? "No source" : s.source.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{s.count.toLocaleString()}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5">{s.percentage}%</Badge>
                  </div>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${sourceColors[s.source] || "bg-muted-foreground"}`}
                    style={{ width: `${Math.max(s.percentage, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Distribution */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Creator Platform Split
            </h3>
            <div className="space-y-3">
              {data.platforms.map((p) => {
                const pct = data.totalCreators ? Math.round((p.count / data.totalCreators) * 100) : 0;
                return (
                  <div key={p.platform} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground capitalize">{p.platform}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{p.count.toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5">{pct}%</Badge>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${p.platform === "tiktok" ? "bg-foreground" : "bg-primary"}`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Search Activity */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Search Activity by Platform
            </h3>
            {data.searchPlatforms.length > 0 ? (
              <div className="space-y-2">
                {data.searchPlatforms.map((sp) => (
                  <div key={sp.platform} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground capitalize">{sp.platform}</span>
                    <span className="text-muted-foreground">{sp.count.toLocaleString()} searches</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total results returned</span>
                  <span className="font-medium text-foreground">{data.totalSearchResults.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No search data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
