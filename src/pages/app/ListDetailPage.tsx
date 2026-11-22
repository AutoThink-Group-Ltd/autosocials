import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Eye, Trash2, Loader2, Users, Mail, MailCheck, MailX,
  Zap, Send, CheckSquare, Square, AlertCircle,
  LayoutGrid, List, RefreshCw, ExternalLink, MessageCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import VideoThumbnail from "@/components/app/VideoThumbnail";
import { CreatorTableView } from "@/components/app/CreatorTableView";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BulkOutreachDialog, type OutreachCreator } from "@/components/app/BulkOutreachDialog";
import { CreatorProfileSheet } from "@/components/app/CreatorProfileSheet";

const gradients = [
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-blue-500",
];

function getColor(i: number): string {
  return gradients[i % gradients.length] ?? gradients[0]!;
}

function formatCount(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function formatEngagement(rate: number | null | undefined): string {
  if (!rate) return "";
  return `${(rate * 100).toFixed(1)}%`;
}

function getDmUrl(platform: string, username: string): string {
  switch (platform.toLowerCase()) {
    case 'tiktok':
      return `https://www.tiktok.com/@${username}`;
    case 'instagram':
      return `https://ig.me/m/${username}`;
    case 'youtube':
      return `https://www.youtube.com/@${username}/about`;
    case 'twitter':
    case 'x':
      return `https://twitter.com/messages/compose?recipient_id=${username}`;
    default:
      return `https://www.tiktok.com/@${username}`;
  }
}

function getPlatformDmLabel(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'tiktok': return 'Open TikTok Profile';
    case 'instagram': return 'Send Instagram DM';
    case 'youtube': return 'Open YouTube About';
    case 'twitter': case 'x': return 'Send X/Twitter DM';
    default: return 'Open Profile';
  }
}

type Creator = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  platform: string;
  follower_count: number | null;
  engagement_rate: number | null;
  avg_views: number | null;
  total_likes: number | null;
  niches: string[] | null;
  latest_video_url: string | null;
  profile_url: string | null;
  last_post_at: string | null;
  contact_email: string | null;
  contact_source: string | null;
  bio: string | null;
};

const ListDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [listName, setListName] = useState("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Resync state
  const [resyncing, setResyncing] = useState(false);
  const [resyncProgress, setResyncProgress] = useState({ updated: 0, total: 0 });

  // Enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [enrichTotal, setEnrichTotal] = useState(0);

  // Contact options dialog (fallback when no email found)
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [noEmailCreators, setNoEmailCreators] = useState<Creator[]>([]);

  // Bulk send state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerCreatorId, setDrawerCreatorId] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadList();
  }, [id]);




  async function loadList() {
    setLoading(true);

    const [listRes, membersRes] = await Promise.all([
      supabase.from("creator_lists").select("name").eq("id", id!).single(),
      supabase
        .from("list_members")
        .select("creator_id, creator_profiles(id, username, display_name, avatar_url, thumbnail_url, platform, follower_count, engagement_rate, avg_views, total_likes, niches, latest_video_url, profile_url, last_post_at, contact_email, contact_source, bio)")
        .eq("list_id", id!),
    ]);

    if (listRes.data) setListName(listRes.data.name);

    const mapped: Creator[] = (membersRes.data || [])
      .map((m: any) => m.creator_profiles)
      .filter(Boolean);

    setCreators(mapped);
    setLoading(false);
  }

  async function removeFromList(creatorId: string) {
    const { error } = await supabase
      .from("list_members")
      .delete()
      .eq("list_id", id!)
      .eq("creator_id", creatorId);

    if (!error) {
      setCreators((prev) => prev.filter((c) => c.id !== creatorId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(creatorId);
        return next;
      });
      toast.success("Removed from list");
    }
  }

  // Batch resync stats via Firecrawl search
  async function resyncStats() {
    const missingStats = creators.filter((c) => !c.follower_count);
    if (missingStats.length === 0) {
      toast.info("All creators already have stats!");
      return;
    }

    setResyncing(true);
    setResyncProgress({ updated: 0, total: missingStats.length });

    let totalUpdated = 0;
    const batchSize = 5;
    let remaining = missingStats.length;

    // Process sequentially - each call handles batch_size creators
    while (remaining > 0) {
      try {
        const { data, error } = await supabase.functions.invoke("batch-resync-creators", {
          body: { batch_size: batchSize },
        });

        if (error) {
          console.error("Resync batch error:", error);
          break;
        }

        if (data?.updated) {
          totalUpdated += data.updated;
        }

        remaining = data?.remaining ?? 0;
        setResyncProgress({ updated: totalUpdated, total: missingStats.length });

        // If nothing was processed, break to avoid infinite loop
        if (!data?.batch_size || data.batch_size === 0) break;
      } catch (e) {
        console.error("Resync batch error:", e);
        break;
      }
    }

    setResyncing(false);
    if (totalUpdated > 0) {
      toast.success(`Resynced ${totalUpdated} creator${totalUpdated !== 1 ? "s" : ""} with fresh stats`);
    } else {
      toast.error("No creator stats were updated in this run");
    }

    if (totalUpdated > 0) loadList();
  }

  // Bulk enrich emails — if creators are selected, enrich those (force mode); otherwise enrich all missing
  async function enrichEmails() {
    const hasSelection = selectedIds.size > 0;
    const targetCreators = hasSelection
      ? creators.filter((c) => selectedIds.has(c.id))
      : creators.filter((c) => !c.contact_email);

    if (targetCreators.length === 0) {
      toast.info(hasSelection ? "No creators selected!" : "All creators already have emails!");
      return;
    }

    // In targeted mode, force re-enrichment even if email exists
    const forceMode = hasSelection;

    setEnriching(true);
    setEnrichTotal(targetCreators.length);
    setEnrichProgress(0);

    const batchSize = 10;
    let totalFound = 0;
    const allResults: any[] = [];

    for (let i = 0; i < targetCreators.length; i += batchSize) {
      const batch = targetCreators.slice(i, i + batchSize);
      const batchIds = batch.map((c) => c.id);

      try {
        const { data, error } = await supabase.functions.invoke("bulk-enrich-emails", {
          body: { creator_ids: batchIds, force: forceMode },
        });

        if (!error && data?.results) {
          allResults.push(...data.results);
          const enriched = data.results.filter((r: any) => r.email && r.source !== 'existing');
          totalFound += enriched.length;

          setCreators((prev) =>
            prev.map((c) => {
              const match = data.results.find((r: any) => r.id === c.id && r.email);
              if (match) {
                return { ...c, contact_email: match.email, contact_source: match.source };
              }
              return c;
            })
          );
        }
      } catch (e) {
        console.error("Enrichment batch error:", e);
      }

      setEnrichProgress(Math.min(i + batchSize, targetCreators.length));
    }

    setEnriching(false);

    // Show contact options for creators where no email was found
    if (hasSelection) {
      const foundIds = new Set(allResults.filter((r: any) => r.email).map((r: any) => r.id));
      const stillNoEmail = targetCreators.filter((tc) => !foundIds.has(tc.id) && !tc.contact_email);
      if (stillNoEmail.length > 0) {
        setNoEmailCreators(stillNoEmail);
        setContactDialogOpen(true);
      }
    }

    toast.success(
      hasSelection
        ? `Found ${totalFound} email${totalFound !== 1 ? "s" : ""} for ${targetCreators.length} selected creator${targetCreators.length !== 1 ? "s" : ""}`
        : `Found ${totalFound} email${totalFound !== 1 ? "s" : ""} out of ${targetCreators.length} creators`
    );
  }

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllWithEmail = () => {
    const withEmail = creators.filter((c) => c.contact_email);
    setSelectedIds(new Set(withEmail.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Open send dialog
  function openSendDialog() {
    const selectedWithEmail = creators.filter(
      (c) => selectedIds.has(c.id) && c.contact_email
    );
    if (selectedWithEmail.length === 0) {
      toast.error("No selected creators have email addresses. Run 'Enrich Emails' first.");
      return;
    }
    setSendDialogOpen(true);
  }




  const withEmail = creators.filter((c) => c.contact_email).length;
  const withoutEmail = creators.length - withEmail;
  const selectedWithEmail = creators.filter(
    (c) => selectedIds.has(c.id) && c.contact_email
  ).length;

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/lists")} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to Lists
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{listName || "List"}</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading..." : `${creators.length} creator${creators.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {!loading && creators.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Email stats badges */}
            <Badge variant="secondary" className="gap-1 text-xs">
              <MailCheck className="w-3 h-3 text-emerald-500" />
              {withEmail} with email
            </Badge>
            <Badge variant="secondary" className="gap-1 text-xs">
              <MailX className="w-3 h-3 text-muted-foreground" />
              {withoutEmail} missing
            </Badge>

            {/* Enrich button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={enrichEmails}
              disabled={enriching || (selectedIds.size === 0 && withoutEmail === 0)}
            >
              {enriching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {enriching
                ? "Enriching..."
                : selectedIds.size > 0
                ? `Enrich ${selectedIds.size} Selected`
                : "Enrich Emails"}
            </Button>

            {/* Resync stats button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={resyncStats}
              disabled={resyncing}
            >
              {resyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {resyncing ? `Syncing ${resyncProgress.updated}/${resyncProgress.total}...` : "Resync Stats"}
            </Button>

            {/* Selection controls */}
            {selectedIds.size > 0 ? (
              <>
                <Button variant="ghost" size="sm" className="text-xs" onClick={clearSelection}>
                  Clear ({selectedIds.size})
                </Button>
                {(() => {
                  const selectedNoEmail = creators.filter(
                    (c) => selectedIds.has(c.id) && !c.contact_email
                  );
                  return selectedNoEmail.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setNoEmailCreators(selectedNoEmail);
                        setContactDialogOpen(true);
                      }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Send DM ({selectedNoEmail.length})
                    </Button>
                  ) : null;
                })()}
                <Button
                  variant="brand"
                  size="sm"
                  className="gap-1.5"
                  onClick={openSendDialog}
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to {selectedWithEmail} creator{selectedWithEmail !== 1 ? "s" : ""}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={selectAllWithEmail}>
                <CheckSquare className="w-3.5 h-3.5" />
                Select all with email
              </Button>
            )}

            {/* View toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden ml-2">
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
        )}
      </div>

      {/* Enrichment progress */}
      {enriching && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">Enriching emails...</span>
            <span className="text-muted-foreground">
              {enrichProgress} / {enrichTotal}
            </span>
          </div>
          <Progress value={(enrichProgress / enrichTotal) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Scanning bios, websites, and link-in-bio pages for contact emails...
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : creators.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground">No creators in this list</h3>
          <p className="text-sm text-muted-foreground mt-1">Discover creators and save them to this list.</p>
          <Button variant="brand" className="mt-4" onClick={() => navigate("/app")}>
            Discover Creators
          </Button>
        </div>
      ) : viewMode === "list" ? (
        <CreatorTableView
          creators={creators}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onRemove={removeFromList}
          showRemove
          gradients={gradients}
          onView={(cid) => setDrawerCreatorId(cid)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {creators.map((creator, i) => {
            const isSelected = selectedIds.has(creator.id);
            return (
              <motion.div
                key={creator.id}
                className={`bg-card rounded-xl border overflow-hidden group hover:shadow-elevated transition-all duration-200 cursor-pointer ${
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => toggleSelect(creator.id)}
              >
                {/* Thumbnail */}
                <div className={`aspect-[4/3] bg-gradient-to-br ${getColor(i)} relative overflow-hidden`}>
                  <VideoThumbnail
                    thumbnailUrl={creator.thumbnail_url}
                    fallbackGradient={getColor(i)}
                    alt={creator.display_name || creator.username || ""}
                    videoUrl={creator.latest_video_url ?? null}
                  />
                  <div className="absolute inset-0 bg-foreground/5 pointer-events-none" />
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-card/90 backdrop-blur-sm rounded-md text-[10px] font-semibold text-foreground capitalize">
                    {creator.platform}
                  </div>

                  {/* Selection indicator */}
                  <div className="absolute top-2.5 right-2.5">
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                        <CheckSquare className="w-4 h-4 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-md bg-card/80 backdrop-blur-sm border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Square className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Email status indicator */}
                  <div className="absolute bottom-2.5 right-2.5">
                    {creator.contact_email ? (
                      <div className="px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[9px] font-semibold flex items-center gap-1">
                        <Mail className="w-2.5 h-2.5" /> Email
                      </div>
                    ) : (
                      <div className="px-2 py-0.5 rounded-full bg-card/80 backdrop-blur-sm text-muted-foreground text-[9px] font-medium flex items-center gap-1">
                        <MailX className="w-2.5 h-2.5" /> No email
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getColor(i)} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-[10px] font-bold">{(creator.display_name || creator.username || "?")[0]?.toUpperCase()}</span>
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

                  {/* Email display */}
                  {creator.contact_email && (
                    <div className="flex items-center gap-1 mb-2 text-[10px] text-emerald-500 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{creator.contact_email}</span>
                    </div>
                  )}

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
                      onClick={(e) => { e.stopPropagation(); setDrawerCreatorId(creator.id); }}
                    >
                      <Eye className="w-3 h-3" /> View Profile
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] gap-1 px-2 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeFromList(creator.id); }}
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Bulk Send Dialog */}
      <BulkOutreachDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        creators={creators as OutreachCreator[]}
        selectedIds={selectedIds}
      />

      {/* Contact Options Dialog — shown when enrichment can't find email */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" /> Alternative Contact Options
            </DialogTitle>
            <DialogDescription>
              We couldn't find emails for {noEmailCreators.length} creator{noEmailCreators.length !== 1 ? "s" : ""}. 
              Use the links below to reach out directly via their platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[400px] overflow-y-auto py-2">
            {noEmailCreators.map((creator) => (
              <div
                key={creator.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors"
              >
                {creator.avatar_url ? (
                  <img src={creator.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-foreground text-xs font-bold">
                      {(creator.display_name || creator.username || "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {creator.display_name || creator.username}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{creator.username} · {creator.platform}
                    {creator.follower_count ? ` · ${formatCount(creator.follower_count)} followers` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => window.open(getDmUrl(creator.platform, creator.username), '_blank')}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {getPlatformDmLabel(creator.platform)}
                  </Button>
                  {creator.profile_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(creator.profile_url!, '_blank')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                noEmailCreators.forEach((creator) => {
                  window.open(getDmUrl(creator.platform, creator.username), '_blank');
                });
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open All ({noEmailCreators.length})
            </Button>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatorProfileSheet
        creatorId={drawerCreatorId}
        open={!!drawerCreatorId}
        onOpenChange={(o) => !o && setDrawerCreatorId(null)}
      />
    </div>
  );
};

export default ListDetailPage;
