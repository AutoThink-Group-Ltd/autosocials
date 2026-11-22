import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, Loader2, FolderPlus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type CreatorList = {
  id: string;
  name: string;
  created_at: string;
};

export type BulkCreatorData = {
  id: string;
  platform: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  profile_url?: string | null;
  avatar_url?: string | null;
  thumbnail_url?: string | null;
  follower_count?: number | null;
  engagement_rate?: number | null;
  avg_views?: number | null;
  total_likes?: number | null;
  niches?: string[];
  website_url?: string | null;
};

interface SaveToListPopoverProps {
  creatorId: string;
  bulkCreatorIds?: string[];
  bulkCreatorData?: BulkCreatorData[];
  trigger?: React.ReactNode;
  onBulkSaveComplete?: () => void;
  onSaved?: (creatorIds: string[]) => void;
}

export function SaveToListPopover({ creatorId, bulkCreatorIds, bulkCreatorData, trigger, onBulkSaveComplete, onSaved }: SaveToListPopoverProps) {
  const { currentWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<CreatorList[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [savedToLists, setSavedToLists] = useState<Set<string>>(new Set());

  const isBulk = bulkCreatorIds && bulkCreatorIds.length > 1;
  const effectiveIds = isBulk ? bulkCreatorIds! : [creatorId];

  useEffect(() => {
    async function checkSaved() {
      const { count } = await supabase
        .from("list_members")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId);
      setIsSaved((count || 0) > 0);
    }
    if (!isBulk) checkSaved();
  }, [creatorId, isBulk]);

  useEffect(() => {
    if (open) {
      loadData();
      setSavedToLists(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!isBulk) setIsSaved(memberOf.size > 0);
  }, [memberOf, isBulk]);

  async function loadData() {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const [listsRes, membersRes] = await Promise.all([
      supabase.from("creator_lists").select("id, name, created_at").order("created_at", { ascending: false }),
      supabase.from("list_members").select("list_id").eq("creator_id", creatorId),
    ]);
    setLists((listsRes.data as CreatorList[]) || []);
    setMemberOf(new Set((membersRes.data || []).map((m: any) => m.list_id)));
    setLoading(false);
  }

  /** Ensure creators with synthetic IDs exist in DB before saving to list */
  async function ensureCreatorsInDb(): Promise<string[]> {
    const resolvedIds: string[] = [];

    for (const id of effectiveIds) {
      // Real DB UUIDs are 36 chars — synthetic IDs start with "phyllo-"
      if (!id.startsWith("phyllo-")) {
        resolvedIds.push(id);
        continue;
      }

      // Find the creator data to upsert
      const creatorData = bulkCreatorData?.find(c => c.id === id);
      if (!creatorData) {
        console.warn("No data for synthetic creator:", id);
        continue;
      }

      // Upsert into creator_profiles and get the real DB ID back
      const { data, error } = await supabase
        .from("creator_profiles")
        .upsert(
          {
            platform: creatorData.platform,
            username: creatorData.username,
            display_name: creatorData.display_name ?? null,
            bio: creatorData.bio ?? null,
            profile_url: creatorData.profile_url ?? null,
            avatar_url: creatorData.avatar_url ?? null,
            thumbnail_url: creatorData.thumbnail_url ?? null,
            follower_count: creatorData.follower_count ?? null,
            engagement_rate: creatorData.engagement_rate ?? null,
            avg_views: creatorData.avg_views ?? null,
            total_likes: creatorData.total_likes ?? null,
            niches: creatorData.niches || [],
            website_url: creatorData.website_url ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "platform,username" }
        )
        .select("id")
        .single();

      if (data) {
        resolvedIds.push(data.id);
      } else if (error) {
        console.error("Failed to upsert creator:", creatorData.username, error);
      }
    }

    return resolvedIds;
  }

  async function toggleList(listId: string) {
    setSaving(listId);

    if (isBulk) {
      try {
        const resolvedIds = await ensureCreatorsInDb();
        if (resolvedIds.length === 0) {
          toast.error("No creators could be saved");
          setSaving(null);
          return;
        }

        // Check which are already in this list
        const { data: existing } = await supabase
          .from("list_members")
          .select("creator_id")
          .eq("list_id", listId)
          .in("creator_id", resolvedIds);

        const existingSet = new Set((existing || []).map((e: any) => e.creator_id));
        const newIds = resolvedIds.filter(id => !existingSet.has(id));
        const alreadyCount = resolvedIds.length - newIds.length;
        const listName = lists.find(l => l.id === listId)?.name || "list";

        if (newIds.length > 0) {
          const inserts = newIds.map(id => ({ list_id: listId, creator_id: id }));
          const { error } = await supabase.from("list_members").insert(inserts);
          if (error) {
            console.error("Bulk save error:", error);
            toast.error("Failed to add creators");
            setSaving(null);
            return;
          }
        }

        setSavedToLists(prev => new Set(prev).add(listId));
        if (alreadyCount === resolvedIds.length) {
          toast.info(`All ${alreadyCount} creators are already in "${listName}"`);
        } else if (alreadyCount > 0) {
          toast.success(`✓ Added ${newIds.length} creators to "${listName}" (${alreadyCount} already there)`);
        } else {
          toast.success(`✓ Saved ${newIds.length} creators to "${listName}"`);
        }
        onBulkSaveComplete?.();
        if (newIds.length > 0) onSaved?.(resolvedIds);
      } catch (err) {
        console.error("Bulk save error:", err);
        toast.error("Failed to add creators");
      }
    } else {
      const isMember = memberOf.has(listId);
      if (isMember) {
        const { error } = await supabase
          .from("list_members")
          .delete()
          .eq("list_id", listId)
          .eq("creator_id", creatorId);
        if (!error) {
          setMemberOf((prev) => { const s = new Set(prev); s.delete(listId); return s; });
          toast.success("Removed from list");
        }
      } else {
        const { error } = await supabase
          .from("list_members")
          .insert({ list_id: listId, creator_id: creatorId });
        if (!error) {
          setMemberOf((prev) => new Set(prev).add(listId));
          toast.success("Added to list");
          onSaved?.([creatorId]);
        } else if (error.code === "23505") {
          toast.info("Already in this list");
        }
      }
    }
    setSaving(null);
  }

  async function createList() {
    if (!newName.trim() || !currentWorkspace?.id) return;
    setSaving("new");
    const { data, error } = await supabase
      .from("creator_lists")
      .insert({ name: newName.trim(), workspace_id: currentWorkspace.id })
      .select("id, name, created_at")
      .single();

    if (error) {
      toast.error("Failed to create list");
      setSaving(null);
      return;
    }

    // Ensure creators exist in DB first
    const resolvedIds = isBulk ? await ensureCreatorsInDb() : effectiveIds;
    const inserts = resolvedIds.map(id => ({ list_id: data.id, creator_id: id }));
    await supabase.from("list_members").upsert(inserts, { onConflict: "list_id,creator_id" });

    setLists((prev) => [data as CreatorList, ...prev]);
    setMemberOf((prev) => new Set(prev).add(data.id));
    setSavedToLists(prev => new Set(prev).add(data.id));
    setNewName("");
    setCreating(false);
    setSaving(null);
    toast.success(isBulk
      ? `Created "${data.name}" and added ${resolvedIds.length} creators`
      : `Created "${data.name}" and added creator`
    );
    onBulkSaveComplete?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className={`gap-1.5 text-xs ${isSaved ? "border-primary/30 text-primary" : ""}`}>
            {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {isSaved ? "Saved" : "Save"}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="px-3 py-2.5 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground">
            {isBulk ? `Add ${effectiveIds.length} creators to list` : "Save to list"}
          </h4>
        </div>

        <div className="max-h-52 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : lists.length === 0 && !creating ? (
            <p className="text-xs text-muted-foreground text-center py-5">No lists yet. Create one below!</p>
          ) : (
            lists.map((list) => {
              const isIn = memberOf.has(list.id);
              const justSaved = savedToLists.has(list.id);
              return (
                <button
                  key={list.id}
                  onClick={() => toggleList(list.id)}
                  disabled={saving === list.id || justSaved}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/60 transition-colors text-left ${justSaved ? "bg-primary/5" : ""}`}
                >
                  <div
                    className={`rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isIn || justSaved ? "bg-primary border-primary" : "border-border"
                    }`}
                    style={{ width: 18, height: 18 }}
                  >
                    {saving === list.id ? (
                      <Loader2 className="w-3 h-3 animate-spin text-primary-foreground" />
                    ) : isIn || justSaved ? (
                      <Check className="w-3 h-3 text-primary-foreground" />
                    ) : null}
                  </div>
                  <span className="text-sm text-foreground truncate flex-1">{list.name}</span>
                  {justSaved && (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-2">
          {creating ? (
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createList()}
                placeholder="List name..."
                className="h-8 text-xs"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={createList}
                disabled={!newName.trim() || saving === "new"}
              >
                {saving === "new" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-primary hover:bg-secondary/60 transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> Create new list
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
