import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CalendarPlus, Facebook, Instagram, Music2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

type Platform = "facebook" | "instagram" | "tiktok";

interface PlannedPost {
  day_offset: number;
  hour: number;
  platform: Platform;
  hook: string;
  caption: string;
  format: string;
  hashtags: string[];
}

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Facebook }> = {
  facebook: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
  tiktok: { label: "TikTok", icon: Music2 },
};

export default function PublishingPlanWeekPage() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");
  const [weekStart, setWeekStart] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(["instagram", "tiktok"]));
  const [planning, setPlanning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [planned, setPlanned] = useState<PlannedPost[]>([]);

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  const generate = async () => {
    if (!currentWorkspace?.id) return;
    if (!brief.trim()) { toast.error("Add a brief so Vibe knows what to plan"); return; }
    if (platforms.size === 0) { toast.error("Pick at least one platform"); return; }
    setPlanning(true);
    setPlanned([]);
    try {
      const { data, error } = await supabase.functions.invoke("plan-week-content", {
        body: {
          workspace_id: currentWorkspace.id,
          brief,
          week_start: weekStart,
          platforms: Array.from(platforms),
          posts_per_day: postsPerDay,
          mode: "preview",
        },
      });
      if (error) throw error;
      setPlanned((data?.posts ?? []) as PlannedPost[]);
      if ((data?.posts ?? []).length === 0) toast.error("Vibe couldn't draft a plan — try a richer brief");
    } catch (e: any) {
      toast.error(e.message ?? "Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const commit = async () => {
    if (!currentWorkspace?.id || planned.length === 0) return;
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("plan-week-content", {
        body: {
          workspace_id: currentWorkspace.id,
          brief,
          week_start: weekStart,
          platforms: Array.from(platforms),
          posts_per_day: postsPerDay,
          mode: "commit",
        },
      });
      if (error) throw error;
      toast.success(`${data?.created_count ?? 0} drafts saved to Posts`);
      navigate("/app/publishing");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Plan the week with Vibe
        </h1>
        <p className="text-muted-foreground mt-1">
          Tell Vibe what's happening this week. Get a draft calendar in seconds — review, then approve in one click.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Brief</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. We're a UK skincare brand launching a new vitamin C serum on Friday. Audience: women 25-40. Goals: drive landing-page visits and educate on benefits."
            rows={5}
          />
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Week starts</Label>
              <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Posts per day</Label>
              <Input type="number" min={1} max={5} value={postsPerDay} onChange={(e) => setPostsPerDay(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Platforms</Label>
              <div className="flex gap-2 pt-1">
                {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
                  const Icon = PLATFORM_META[p].icon;
                  const on = platforms.has(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${on ? "border-primary/40 bg-primary/8 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {PLATFORM_META[p].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={generate} disabled={planning}>
              {planning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {planning ? "Vibe is planning…" : "Plan my week"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {planned.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Draft calendar · {planned.length} posts</CardTitle>
            <Button onClick={commit} disabled={committing}>
              {committing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
              Save all as drafts
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {planned
              .slice()
              .sort((a, b) => a.day_offset - b.day_offset || a.hour - b.hour)
              .map((p, i) => {
                const day = addDays(new Date(weekStart), p.day_offset ?? 0);
                const Icon = PLATFORM_META[p.platform]?.icon ?? Sparkles;
                return (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">{PLATFORM_META[p.platform]?.label ?? p.platform}</span>
                        <span>·</span>
                        <span>{format(day, "EEE d MMM")} at {String(p.hour ?? 10).padStart(2, "0")}:00</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{p.format}</Badge>
                    </div>
                    <div className="text-sm font-medium">{p.hook}</div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{p.caption}</div>
                    {p.hashtags?.length > 0 && (
                      <div className="text-xs text-primary/80">{p.hashtags.join(" ")}</div>
                    )}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}