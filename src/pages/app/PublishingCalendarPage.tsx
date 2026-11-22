import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  eachDayOfInterval,
} from "date-fns";

interface PostRow {
  id: string;
  status: string;
  caption: string;
  scheduled_at: string | null;
  published_at: string | null;
}

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  publishing: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
};

export default function PublishingCalendarPage() {
  const { currentWorkspace } = useWorkspace();
  const [cursor, setCursor] = useState(new Date());
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPostId, setComposerPostId] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [cursor]);

  useEffect(() => {
    const load = async () => {
      if (!currentWorkspace?.id) return;
      setLoading(true);
      const startIso = range.start.toISOString();
      const endIso = range.end.toISOString();
      // Fetch posts that EITHER have scheduled_at in range OR were published in range
      const { data } = await supabase
        .from("posts")
        .select("id, status, caption, scheduled_at, published_at")
        .eq("workspace_id", currentWorkspace.id)
        .or(
          `and(scheduled_at.gte.${startIso},scheduled_at.lte.${endIso}),and(published_at.gte.${startIso},published_at.lte.${endIso})`
        );
      setPosts((data ?? []) as PostRow[]);
      setLoading(false);
    };
    load();
  }, [currentWorkspace?.id, range.start, range.end, composerOpen]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, PostRow[]>();
    for (const p of posts) {
      // Use published_at for published posts, otherwise scheduled_at
      const dateStr = p.status === "published" && p.published_at ? p.published_at : p.scheduled_at;
      if (!dateStr) continue;
      const key = format(new Date(dateStr), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    // Sort each day chronologically
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ad = new Date((a.status === "published" && a.published_at) || a.scheduled_at || 0).getTime();
        const bd = new Date((b.status === "published" && b.published_at) || b.scheduled_at || 0).getTime();
        return ad - bd;
      });
    }
    return map;
  }, [posts]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            {loading ? "Loading…" : `${posts.length} post${posts.length === 1 ? "" : "s"} this view`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[140px] text-center">{format(cursor, "MMMM yyyy")}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button asChild size="sm">
            <Link to="/app/publishing/composer">
              <Plus className="h-4 w-4 mr-1" /> New
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 border-b text-xs uppercase tracking-wide text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="p-2 text-center font-medium">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {range.days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = postsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={key}
                      className={`min-h-[110px] border-r border-b p-1.5 ${inMonth ? "bg-background" : "bg-muted/30"}`}
                    >
                      <div
                        className={`text-xs font-medium mb-1 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                          isToday ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {items.slice(0, 3).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setComposerPostId(p.id);
                              setComposerOpen(true);
                            }}
                            className="w-full text-left"
                          >
                            <Badge
                              variant="outline"
                              className={`w-full justify-start text-xs font-normal truncate cursor-pointer hover:opacity-80 ${STATUS_TONE[p.status] ?? ""}`}
                            >
                              {format(
                                new Date(
                                  (p.status === "published" && p.published_at) || p.scheduled_at || new Date()
                                ),
                                "HH:mm"
                              )}{" "}
                              · {p.caption.slice(0, 24) || "Untitled"}
                            </Badge>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <div className="text-xs text-muted-foreground pl-1">+{items.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ComposerDrawer
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setComposerPostId(null);
        }}
        postId={composerPostId}
      />
    </div>
  );
}