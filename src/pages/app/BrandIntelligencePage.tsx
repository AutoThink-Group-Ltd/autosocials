import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, Building2, TrendingUp, Eye, Calendar,
  ExternalLink, ChevronRight, Users, Megaphone, ArrowLeft,
  Globe, Target, Play, Lightbulb, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ─── Constants ─── */
const COUNTRY_OPTIONS = [
  { value: "", label: "All countries" },
  { value: "GB", label: "🇬🇧 United Kingdom" },
  { value: "US", label: "🇺🇸 United States" },
  { value: "DE", label: "🇩🇪 Germany" },
  { value: "FR", label: "🇫🇷 France" },
  { value: "ES", label: "🇪🇸 Spain" },
  { value: "IT", label: "🇮🇹 Italy" },
  { value: "NL", label: "🇳🇱 Netherlands" },
  { value: "BE", label: "🇧🇪 Belgium" },
  { value: "AT", label: "🇦🇹 Austria" },
  { value: "SE", label: "🇸🇪 Sweden" },
  { value: "PL", label: "🇵🇱 Poland" },
  { value: "IE", label: "🇮🇪 Ireland" },
  { value: "PT", label: "🇵🇹 Portugal" },
  { value: "CZ", label: "🇨🇿 Czech Republic" },
  { value: "RO", label: "🇷🇴 Romania" },
  { value: "NO", label: "🇳🇴 Norway" },
  { value: "DK", label: "🇩🇰 Denmark" },
  { value: "FI", label: "🇫🇮 Finland" },
  { value: "CH", label: "🇨🇭 Switzerland" },
];

const SEARCH_EXAMPLES: Record<string, string[]> = {
  ads: ["skincare", "protein powder", "mobile games", "fashion brand", "fitness app", "meal delivery"],
  advertisers: ["Nike", "Gymshark", "HelloFresh", "Shein", "Amazon", "L'Oréal"],
  content: ["beauty tutorial", "unboxing", "fashion haul", "fitness routine", "cooking recipe", "tech review"],
};

/* ─── Types ─── */
interface TikTokAd {
  ad?: {
    id?: number;
    first_shown_date?: string;
    last_shown_date?: string;
    reach?: number;
    status?: string;
    status_statement?: string;
    image_urls?: string[];
    videos?: { cover_image_url?: string; video_url?: string }[];
  };
  advertiser?: {
    business_name?: string;
    business_id?: number;
    paid_for_by?: string;
  };
}

interface TikTokAdvertiser {
  business_id?: number;
  business_name?: string;
  country_code?: string;
}

interface CommercialContent {
  id?: number;
  create_date?: string;
  create_timestamp?: number;
  brand_names?: string[];
  creator?: { nickname?: string; username?: string };
  videos?: { cover_image_url?: string; video_url?: string }[];
  label?: string;
}

/* ─── Helpers ─── */
const formatDate = (d?: string) => {
  if (!d) return "—";
  const s = String(d);
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
};

const formatReach = (n?: number) => {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

/* ─── API caller ─── */
async function callTikTok(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("tiktok-commercial", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || "Request failed");
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  return data;
}

/* ─── Main Page ─── */
const BrandIntelligencePage = () => {
  const [activeTab, setActiveTab] = useState("ads");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);

  // Ads
  const [ads, setAds] = useState<TikTokAd[]>([]);
  const [adsHasMore, setAdsHasMore] = useState(false);
  const [adsSearchId, setAdsSearchId] = useState<string | null>(null);

  // Advertisers
  const [advertisers, setAdvertisers] = useState<TikTokAdvertiser[]>([]);

  // Commercial content
  const [content, setContent] = useState<CommercialContent[]>([]);
  const [contentHasMore, setContentHasMore] = useState(false);
  const [contentSearchId, setContentSearchId] = useState<string | null>(null);

  // Ad detail
  const [selectedAdDetail, setSelectedAdDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleSearch = async (loadMore = false, overrideParams?: Record<string, unknown>) => {
    if (!query.trim() && !loadMore && !overrideParams) return;
    setLoading(true);

    try {
      if (activeTab === "ads" || overrideParams) {
        const res = await callTikTok("search_ads", {
          search_term: query || undefined,
          max_count: 50,
          ...(country ? { country } : {}),
          ...(loadMore && adsSearchId ? { search_id: adsSearchId } : {}),
          ...overrideParams,
        });
        const newAds = res?.data?.ads || [];
        setAds((prev) => (loadMore ? [...prev, ...newAds] : newAds));
        setAdsHasMore(res?.data?.has_more || false);
        setAdsSearchId(res?.data?.search_id || null);
        if (overrideParams) setActiveTab("ads");
      } else if (activeTab === "advertisers") {
        const res = await callTikTok("search_advertisers", { search_term: query });
        setAdvertisers(res?.data?.advertisers || []);
      } else {
        const res = await callTikTok("search_commercial_content", {
          search_term: query,
          max_count: 50,
          ...(country ? { country } : {}),
          ...(loadMore && contentSearchId ? { search_id: contentSearchId } : {}),
        });
        const newContent = res?.data?.commercial_contents || [];
        setContent((prev) => (loadMore ? [...prev, ...newContent] : newContent));
        setContentHasMore(res?.data?.has_more || false);
        setContentSearchId(res?.data?.search_id || null);
      }
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdDetail = async (adId: number) => {
    setLoadingDetail(true);
    try {
      const res = await callTikTok("ad_detail", { ad_id: adId });
      setSelectedAdDetail(res?.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load ad details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const viewAdvertiserAds = (businessId: number, businessName: string) => {
    setQuery("");
    handleSearch(false, { advertiser_business_ids: [businessId] });
    toast.success(`Showing ads from ${businessName}`);
  };

  const useExample = (example: string) => {
    setQuery(example);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 h-full overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Brand Intelligence</h1>
              <p className="text-sm text-muted-foreground">
                Discover brands advertising on TikTok, their ad campaigns, and paid creator partnerships
              </p>
            </div>
          </div>
        </div>

        {/* Search + Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); }} className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                className="flex gap-2 flex-1"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      activeTab === "ads" ? 'e.g. "skincare", "protein powder", brand name...' :
                      activeTab === "advertisers" ? 'e.g. "Nike", "Gymshark", "HelloFresh"...' :
                      'e.g. "beauty tutorial", "unboxing", brand name...'
                    }
                    className="pl-10"
                  />
                </div>
                <Button type="submit" disabled={loading || !query.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </Button>
              </form>
              <TabsList className="shrink-0">
                <TabsTrigger value="ads" className="gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Ads
                </TabsTrigger>
                <TabsTrigger value="advertisers" className="gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Advertisers
                </TabsTrigger>
                <TabsTrigger value="content" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Branded Content
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Filters row */}
            {activeTab !== "advertisers" && (
              <div className="flex items-center gap-3">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="All countries" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value || "all"} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Example suggestions */}
            {((activeTab === "ads" && ads.length === 0) ||
              (activeTab === "advertisers" && advertisers.length === 0) ||
              (activeTab === "content" && content.length === 0)) && !loading && (
              <div className="flex items-center gap-2 flex-wrap">
                <Lightbulb className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Try:</span>
                {SEARCH_EXAMPLES[activeTab]?.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => useExample(ex)}
                    className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Ad Detail Overlay ── */}
          <AnimatePresence>
            {selectedAdDetail && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="mb-4"
              >
                <Card className="border-primary/20">
                  <CardContent className="p-5">
                    <button
                      onClick={() => setSelectedAdDetail(null)}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to results
                    </button>

                    {loadingDetail ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Left: Ad info */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-foreground">
                            {selectedAdDetail.advertiser?.business_name || "Unknown Advertiser"}
                          </h3>
                          <div className="grid grid-cols-2 gap-3">
                            <InfoCard icon={Eye} label="Reach" value={formatReach(selectedAdDetail.ad?.reach)} />
                            <InfoCard icon={Calendar} label="First shown" value={formatDate(selectedAdDetail.ad?.first_shown_date)} />
                            <InfoCard icon={Calendar} label="Last shown" value={formatDate(selectedAdDetail.ad?.last_shown_date)} />
                            <InfoCard icon={Users} label="Followers" value={formatReach(selectedAdDetail.advertiser?.follower_count)} />
                          </div>
                          {selectedAdDetail.ad?.status_statement && (
                            <p className="text-xs text-muted-foreground italic">{selectedAdDetail.ad.status_statement}</p>
                          )}
                          {selectedAdDetail.advertiser?.profile_url && (
                            <a
                              href={selectedAdDetail.advertiser.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> View TikTok profile
                            </a>
                          )}
                        </div>

                        {/* Right: Targeting */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Target className="w-4 h-4" /> Targeting Info
                          </h4>
                          {selectedAdDetail.ad_group?.targeting_info ? (
                            <div className="space-y-2 text-sm">
                              {selectedAdDetail.ad_group.targeting_info.country && (
                                <div className="flex items-center gap-2">
                                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Countries:</span>
                                  <span className="text-foreground">{selectedAdDetail.ad_group.targeting_info.country.join(", ")}</span>
                                </div>
                              )}
                              {selectedAdDetail.ad_group.targeting_info.gender && (
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Gender:</span>
                                  <span className="text-foreground">{selectedAdDetail.ad_group.targeting_info.gender}</span>
                                </div>
                              )}
                              {selectedAdDetail.ad_group.targeting_info.age && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">Age:</span>
                                  <span className="text-foreground">{selectedAdDetail.ad_group.targeting_info.age.join(", ")}</span>
                                </div>
                              )}
                              {selectedAdDetail.ad_group.targeting_info.interest_category && (
                                <div>
                                  <span className="text-muted-foreground">Interests:</span>
                                  <p className="text-foreground mt-0.5">{selectedAdDetail.ad_group.targeting_info.interest_category}</p>
                                </div>
                              )}
                              {selectedAdDetail.ad_group.targeting_info.number_of_users_targeted && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">Users targeted:</span>
                                  <span className="text-foreground font-medium">{selectedAdDetail.ad_group.targeting_info.number_of_users_targeted}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No targeting data available</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Ads Tab ── */}
          <TabsContent value="ads" className="space-y-3">
            {ads.length === 0 && !loading && (
              <EmptyState
                text="Search for keywords, brand names, or product categories to find TikTok ad campaigns"
                icon={TrendingUp}
              />
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ads.map((item, idx) => (
                <Card
                  key={`${item.ad?.id || idx}`}
                  className="hover:shadow-card transition-shadow cursor-pointer group"
                  onClick={() => { if (item.ad?.id) { setSelectedAdDetail(null); fetchAdDetail(item.ad.id); } }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {item.ad?.videos?.[0]?.cover_image_url ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-secondary relative">
                          <img src={item.ad.videos[0].cover_image_url} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      ) : item.ad?.image_urls?.[0] ? (
                        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-secondary">
                          <img src={item.ad.image_urls[0]} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <Megaphone className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.advertiser?.business_name || "Unknown"}
                        </p>
                        {item.advertiser?.paid_for_by && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            Paid by: {item.advertiser.paid_for_by}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                          {item.ad?.reach != null && (
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {formatReach(item.ad.reach)}
                            </span>
                          )}
                          <span>{formatDate(item.ad?.first_shown_date)} → {formatDate(item.ad?.last_shown_date)}</span>
                        </div>
                        {item.ad?.status && (
                          <Badge variant={item.ad.status === "active" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0 mt-1">
                            {item.ad.status}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {adsHasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => handleSearch(true)} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── Advertisers Tab ── */}
          <TabsContent value="advertisers" className="space-y-3">
            {advertisers.length === 0 && !loading && (
              <EmptyState text="Search for brand or company names to find advertisers on TikTok" icon={Building2} />
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {advertisers.map((adv, idx) => (
                <Card key={`${adv.business_id || idx}`} className="hover:shadow-card transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{adv.business_name || "Unknown"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {adv.country_code && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {adv.country_code}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">ID: {adv.business_id}</span>
                      </div>
                    </div>
                    {adv.business_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs shrink-0"
                        onClick={() => viewAdvertiserAds(adv.business_id!, adv.business_name || "Advertiser")}
                      >
                        <TrendingUp className="w-3.5 h-3.5 mr-1" /> View Ads
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Branded Content Tab ── */}
          <TabsContent value="content" className="space-y-3">
            {content.length === 0 && !loading && (
              <EmptyState text="Search keywords to find branded creator partnerships and sponsored content" icon={Users} />
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {content.map((item, idx) => (
                <Card key={`${item.id || idx}`} className="hover:shadow-card transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {item.videos?.[0]?.cover_image_url ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-secondary">
                          <img src={item.videos[0].cover_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <Play className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {item.creator?.nickname && (
                          <p className="text-sm font-semibold text-foreground truncate">{item.creator.nickname}</p>
                        )}
                        {item.creator?.username && (
                          <p className="text-[11px] text-muted-foreground">@{item.creator.username}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.brand_names?.map((b) => (
                            <Badge key={b} variant="secondary" className="text-[10px] px-1.5 py-0">{b}</Badge>
                          ))}
                          {item.label && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.label}</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{formatDate(item.create_date)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {contentHasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => handleSearch(true)} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

/* ─── Sub-components ─── */
const InfoCard = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="bg-secondary/50 rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
      <Icon className="w-3 h-3" /> {label}
    </div>
    <p className="text-sm font-semibold text-foreground">{value}</p>
  </div>
);

const EmptyState = ({ text, icon: Icon }: { text: string; icon: any }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-muted-foreground" />
    </div>
    <p className="text-sm text-muted-foreground max-w-xs">{text}</p>
  </div>
);

export default BrandIntelligencePage;
