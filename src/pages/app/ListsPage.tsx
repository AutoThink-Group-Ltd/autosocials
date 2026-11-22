import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MoreHorizontal, Users, ArrowRight, Clock, Trash2, Loader2, FolderPlus, ExternalLink, Play, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { UpgradeDialog } from "@/components/app/UpgradeDialog";
import { useUsageGate } from "@/hooks/useUsageGate";
import { useUsageCounts } from "@/hooks/useUsageCounts";
import { CreatorProfileSheet } from "@/components/app/CreatorProfileSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ListMember = {
  creator_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  platform: string;
  thumbnail_url: string | null;
  latest_video_url: string | null;
  last_post_at: string | null;
  profile_url: string | null;
  raw_data: any;
};

type ListWithMembers = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  members: ListMember[];
  count: number;
};

// Auto-scrolling content strip component
const ContentStrip = ({ members }: { members: ListMember[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const thumbnails = members
    .flatMap((m) => {
      const recentMedia = Array.isArray(m.raw_data?.recent_media) ? m.raw_data.recent_media : [];
      return recentMedia
        .filter((item: any) => item?.thumbnail)
        .map((item: any) => ({
          thumbnail: item.thumbnail,
          url: item.url || m.latest_video_url,
          caption: item.caption || null,
          username: m.username,
          platform: m.platform,
        }));
    })
    .concat(
      members
        .filter((m) => m.thumbnail_url && !(Array.isArray(m.raw_data?.recent_media) && m.raw_data.recent_media.length > 0))
        .map((m) => ({
          thumbnail: m.thumbnail_url!,
          url: m.latest_video_url,
          caption: null,
          username: m.username,
          platform: m.platform,
        }))
    )
    .slice(0, 12);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || thumbnails.length < 4) return;

    let animId: number;
    let scrollPos = 0;
    const speed = 0.4;

    const animate = () => {
      scrollPos += speed;
      if (scrollPos >= el.scrollWidth / 2) scrollPos = 0;
      el.scrollLeft = scrollPos;
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    const pause = () => cancelAnimationFrame(animId);
    const resume = () => { animId = requestAnimationFrame(animate); };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, [thumbnails.length]);

  if (thumbnails.length === 0) return null;

  // Double the items for seamless looping
  const items = thumbnails.length >= 4 ? [...thumbnails, ...thumbnails] : thumbnails;

  return (
    <div className="mb-3 -mx-5">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-hidden px-5"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item, i) => (
          <a
            key={i}
            href={item.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 relative group/thumb rounded-lg overflow-hidden"
            onClick={(e) => { if (!item.url) e.preventDefault(); }}
          >
            <img
              src={item.thumbnail}
              alt=""
              className="w-16 h-20 object-cover rounded-lg"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const el = e.currentTarget.closest('a');
                if (el) (el as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-foreground/0 group-hover/thumb:bg-foreground/40 transition-colors duration-200 flex items-center justify-center">
              <Play className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

function formatLastPost(date: string | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

const ListsPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const [lists, setLists] = useState<ListWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const { checkLimit, upgradeDialogProps } = useUsageGate();
  const { counts: usageCounts } = useUsageCounts();
  const [drawerCreatorId, setDrawerCreatorId] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace?.id) loadLists();
  }, [currentWorkspace?.id]);

  async function loadLists() {
    if (!currentWorkspace?.id) return;
    setLoading(true);

    // Single query: fetch lists with members in one go
    const { data: listsData } = await supabase
      .from("creator_lists")
      .select("*, list_members(creator_id, creator_profiles(username, display_name, avatar_url, platform, thumbnail_url, latest_video_url, last_post_at, profile_url, raw_data))")
      .eq("workspace_id", currentWorkspace.id)
      .order("updated_at", { ascending: false });

    if (!listsData) { setLoading(false); return; }

    const listsWithMembers: ListWithMembers[] = listsData.map((list: any) => {
      const members = (list.list_members || []).map((m: any) => ({
        creator_id: m.creator_id,
        username: m.creator_profiles?.username || "unknown",
        display_name: m.creator_profiles?.display_name || null,
        avatar_url: m.creator_profiles?.avatar_url || null,
        platform: m.creator_profiles?.platform || "tiktok",
        thumbnail_url: m.creator_profiles?.thumbnail_url || null,
        latest_video_url: m.creator_profiles?.latest_video_url || null,
        last_post_at: m.creator_profiles?.last_post_at || null,
        profile_url: m.creator_profiles?.profile_url || null,
        raw_data: m.creator_profiles?.raw_data || null,
      }));
      return {
        id: list.id,
        name: list.name,
        description: list.description,
        created_at: list.created_at,
        updated_at: list.updated_at,
        members: members.slice(0, 8),
        count: members.length,
      };
    });

    setLists(listsWithMembers);
    setLoading(false);
  }

  async function createList() {
    if (!newName.trim() || !currentWorkspace?.id) return;
    // Check creator lists limit
    if (!checkLimit("creator_lists", usageCounts.creator_lists)) return;
    setCreating(true);
    const { error } = await supabase
      .from("creator_lists")
      .insert({ name: newName.trim(), workspace_id: currentWorkspace.id });

    if (error) {
      toast.error("Failed to create list");
    } else {
      toast.success("List created");
      setNewName("");
      setCreateOpen(false);
      loadLists();
    }
    setCreating(false);
  }

  async function renameList(id: string) {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("creator_lists")
      .update({ name: editName.trim() })
      .eq("id", id);
    if (!error) {
      setLists((prev) => prev.map((l) => l.id === id ? { ...l, name: editName.trim() } : l));
      toast.success("List renamed");
    }
    setEditingListId(null);
  }

  async function deleteList(id: string) {
    const { error } = await supabase.from("creator_lists").delete().eq("id", id);
    if (!error) {
      setLists((prev) => prev.filter((l) => l.id !== id));
      toast.success("List deleted");
    }
  }

  function timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  function getInitials(name: string | null, username: string): string {
    if (name) return name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
    return username.substring(0, 2).toUpperCase();
  }

  const gradients = [
    "from-pink-400 to-rose-500",
    "from-violet-400 to-purple-500",
    "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500",
    "from-cyan-400 to-blue-500",
    "from-fuchsia-400 to-purple-500",
  ];

  return (
    <>
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Creator Lists</h1>
          <p className="text-muted-foreground">Organise creators into lists for campaigns and outreach</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" className="gap-2">
              <Plus className="w-4 h-4" /> New List
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create new list</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mt-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createList()}
                placeholder="e.g. Q2 Campaign, UGC Candidates..."
                autoFocus
              />
              <Button onClick={createList} disabled={!newName.trim() || creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : lists.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center h-64 gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
            <FolderPlus className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-foreground mb-1">No lists yet</h3>
            <p className="text-sm text-muted-foreground">Create a list to start organising your creators</p>
          </div>
          <Button variant="brand" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Create your first list
          </Button>
        </motion.div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {lists.map((list, i) => (
            <motion.div
              key={list.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 group"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg gradient-brand flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{list.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{list.count} creator{list.count !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(list.updated_at)}</span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                   <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => { setEditingListId(list.id); setEditName(list.name); }}
                    >
                      <Pencil className="w-4 h-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => deleteList(list.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete list
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Auto-scrolling content thumbnails */}
              <ContentStrip members={list.members} />

              {/* Creator rows */}
              {list.members.length > 0 ? (
                <div className="space-y-1 mb-3">
                  {list.members.slice(0, 4).map((member) => {
                    const g = gradients[member.username.charCodeAt(0) % gradients.length];
                    const lastPosted = member.last_post_at || (member.raw_data?.recent_media?.[0]?.timestamp);
                    return (
                      <div
                        key={member.creator_id}
                        className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors cursor-pointer"
                        onClick={() => setDrawerCreatorId(member.creator_id)}
                      >
                        {/* Real avatar */}
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.display_name || member.username}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} items-center justify-center shrink-0 ${member.avatar_url ? 'hidden' : 'flex'}`}>
                          <span className="text-white text-[10px] font-bold">{getInitials(member.display_name, member.username)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-foreground font-medium truncate">{member.display_name || member.username}</span>
                            <span className="text-[10px] text-muted-foreground">@{member.username}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize shrink-0">{member.platform}</span>
                          </div>
                          {lastPosted && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                Last posted {formatLastPost(lastPosted)}
                              </span>
                              {member.latest_video_url && (
                                <a
                                  href={member.latest_video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-primary hover:underline ml-1 inline-flex items-center gap-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No creators in this list yet</p>
              )}

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div className="flex -space-x-1.5">
                  {list.members.slice(0, 5).map((m, idx) => {
                    const g = gradients[m.username.charCodeAt(0) % gradients.length];
                    return (
                      <div key={idx} className="relative shrink-0">
                        {m.avatar_url ? (
                          <img
                            src={m.avatar_url}
                            alt=""
                            className="w-6 h-6 rounded-full border-2 border-card object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${g} border-2 border-card items-center justify-center ${m.avatar_url ? 'hidden' : 'flex'}`}>
                          <span className="text-white text-[8px] font-bold">{getInitials(m.display_name, m.username)[0]}</span>
                        </div>
                      </div>
                    );
                  })}
                  {list.count > 5 && (
                    <div className="w-6 h-6 rounded-full bg-secondary border-2 border-card flex items-center justify-center">
                      <span className="text-[8px] font-medium text-muted-foreground">+{list.count - 5}</span>
                    </div>
                  )}
                </div>
                <span
                  className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-1.5 transition-all cursor-pointer"
                  onClick={() => navigate(`/app/lists/${list.id}`)}
                >
                  View list <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
    <UpgradeDialog {...upgradeDialogProps} currentUsage={upgradeDialogProps.currentUsage ?? 0} currentLimit={upgradeDialogProps.currentLimit ?? 0} />
    <CreatorProfileSheet
      creatorId={drawerCreatorId}
      open={!!drawerCreatorId}
      onOpenChange={(o) => !o && setDrawerCreatorId(null)}
    />
    </>
  );
};

export default ListsPage;