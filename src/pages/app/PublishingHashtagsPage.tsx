import { useEffect, useState } from "react";
import { suggestHashtags } from "@/lib/suggest-hashtags.functions";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Sparkles, Copy } from "lucide-react";

interface HashtagGroup {
  id: string;
  name: string;
  hashtags: string[];
}

export default function PublishingHashtagsPage() {
  const { currentWorkspace } = useWorkspace();
  const [groups, setGroups] = useState<HashtagGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggestSeed, setSuggestSeed] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  const load = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("hashtag_groups")
      .select("id, name, hashtags")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false });
    setGroups((data ?? []) as HashtagGroup[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentWorkspace?.id]);

  const parseTags = (raw: string) =>
    raw.split(/[\s,#]+/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);

  const create = async () => {
    if (!currentWorkspace?.id || !name.trim()) return;
    setCreating(true);
    try {
      const tags = parseTags(tagsInput);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("hashtag_groups").insert({
        workspace_id: currentWorkspace.id,
        name: name.trim(),
        hashtags: tags,
        ...(u.user?.id !== undefined ? { created_by: u.user.id } : {}),
      });
      if (error) throw error;
      setName(""); setTagsInput(""); setSuggestSeed("");
      toast.success("Group saved");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save group");
    } finally { setCreating(false); }
  };

  const remove = async (id: string) => {
    await supabase.from("hashtag_groups").delete().eq("id", id);
    setGroups((g) => g.filter((x) => x.id !== id));
  };

  const copy = async (group: HashtagGroup) => {
    const text = group.hashtags.map((t) => `#${t}`).join(" ");
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const askVibe = async () => {
    setSuggesting(true);
    try {
      const data = await suggestHashtags({
        data: { caption: suggestSeed, niche: suggestSeed || "creator marketing", platform: "instagram" },
      });
      const tags: string[] = data.hashtags;
      setTagsInput(tags.join(" "));
      toast.success(`Vibe suggested ${tags.length} hashtags`);
    } catch (e: any) {
      toast.error(e.message ?? "Vibe couldn't help right now");
    } finally { setSuggesting(false); }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Hashtag groups</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Save sets of hashtags you reuse, or let Vibe suggest fresh ones for any niche.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">New group</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Group name (e.g. Skincare launches)" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder="#skincare #glowup #serum — separate with spaces, commas or new lines"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Topic or seed for Vibe (optional)"
              value={suggestSeed}
              onChange={(e) => setSuggestSeed(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={askVibe} disabled={suggesting}>
              {suggesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Ask Vibe
            </Button>
            <Button onClick={create} disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Save group
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No groups yet. Save your first set above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{g.name}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.hashtags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">#{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => copy(g)} aria-label="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(g.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}