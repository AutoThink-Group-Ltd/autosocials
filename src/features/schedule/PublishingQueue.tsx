import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Facebook,
  Instagram,
  Youtube,
  Music2,
  CircleUserRound,
  Plus,
  Search,
  Radio,
  ImagePlus,
  FileText,
  RefreshCw,
  AlertCircle,
  CalendarClock,
  List,
  LayoutGrid,
  Send,
} from "lucide-react";
import { SiX } from "react-icons/si";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";
import { NativeAccountFeed, type FeedPlatform } from "@/components/publishing/NativeAccountFeed";
import SocialConnectionsPage from "@/pages/app/SocialConnectionsPage";
import { useScheduleDialog } from "./ScheduleDialogHost";
import { PublishingOverview } from "./PublishingOverview";
import { UpcomingScheduleEditor } from "./UpcomingScheduleEditor";
import { unschedulePublishPost } from "@/lib/unschedule-publish.functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SamPane } from "@/features/sam/SamPane";
import { toast } from "sonner";
import {
  reschedulePublishPost,
  duplicatePublishPost,
  schedulePublishBatch,
  configurePublishAutopilot,
  getPublishAutopilot,
} from "@/lib/publishing.functions";
import { cn } from "@/lib/utils";
import {
  calendarDays,
  dateKey,
  workspaceInstant,
  shiftCursor,
  type PlannerView,
} from "./planner";

type Account = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  platform: string;
  status: string;
  is_enabled: boolean;
  expires_at: string | null;
};
type Target = {
  id: string;
  social_account_id: string;
  status: string;
  platform: string;
  error: string | null;
  youtube_upload_bytes: number | null;
  youtube_upload_total_bytes: number | null;
};
type Media = {
  storage_path: string;
  kind: string;
  position: number;
  url?: string | undefined;
};
type Post = {
  id: string;
  updated_at: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  post_targets: Target[];
  post_media: Media[];
};
const STATUS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Needs attention",
  partially_published: "Partially published",
  cancelled: "Cancelled",
  awaiting_approval: "Awaiting approval",
};
const stamp = (post: Post) => post.published_at || post.scheduled_at;
function outcome(post: Post) {
  const successes = post.post_targets.filter(
    (target) => target.status === "published",
  ).length;
  if (
    successes &&
    successes < post.post_targets.length &&
    post.post_targets.some((target) => target.status === "failed")
  )
    return "partially_published";
  return post.status;
}
function AccountAvatar({
  account,
  className,
}: {
  account: Account;
  className?: string;
}) {
  const Icon = account.platform === "instagram" ? Instagram : account.platform === "facebook" ? Facebook : account.platform === "x" ? SiX : account.platform === "youtube" ? Youtube : account.platform === "tiktok" ? Music2 : CircleUserRound;
  return (
    <span
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold",
        className,
      )}
    >
      {account.avatar_url ? (
        <img
          src={account.avatar_url}
          alt=""
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        (account.display_name || account.handle || "?").slice(0, 1)
      )}
      <Icon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background p-0.5" />
    </span>
  );
}

export function PublishingQueue({ requestedPostId }: { requestedPostId?: string | undefined } = {}) {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const ws = currentWorkspace?.id;
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const { openSchedule } = useScheduleDialog();
  const [removePost, setRemovePost] = useState<Post | null>(null);
  useEffect(() => {
    if (!ws) return;
    const key = `as:schedule-selected-assets:${ws}`;
    const saved = sessionStorage.getItem(key);
    if (!saved) return;
    sessionStorage.removeItem(key);
    try {
      const ids: unknown = JSON.parse(saved);
      if (Array.isArray(ids) && ids.every(id => typeof id === "string")) {
        openSchedule(ids.slice(0, 20));
      }
    } catch { /* Ignore an invalid saved selection. */ }
  }, [ws]);
  const [autoAccounts, setAutoAccounts] = useState<Set<string>>(new Set());
  const [autoSources, setAutoSources] = useState<Set<string>>(new Set());
  const [autoDays, setAutoDays] = useState<number[]>([1, 3, 5]);
  const [autoTime, setAutoTime] = useState("09:00");
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [calendarPostId, setCalendarPostId] = useState<string | null>(null);
  const [movePost, setMovePost] = useState<Post | null>(null);
  const [slotDay, setSlotDay] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [slotTime, setSlotTime] = useState("09:00");
  const [interval, setInterval] = useState(24);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<PlannerView>("month");
  const [cursor, setCursor] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [accountId, setAccountId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<"planner" | "feeds">("planner");
  const [composerOpen, setComposerOpen] = useState(false);
  const [initialScheduledAt, setInitialScheduledAt] = useState<Date | null>(
    null,
  );
  const [postId, setPostId] = useState<string | null>(null);
  const [samOpen, setSamOpen] = useState(false);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["publish-planner", ws],
    enabled: !!ws,
    refetchInterval: 30000,
    queryFn: async () => {
      const [workspace, accounts, posts] = await Promise.all([
        supabase.from("workspaces").select("timezone,requires_approval").eq("id", ws!).single(),
        supabase
          .from("social_accounts")
          .select(
            "id,display_name,handle,avatar_url,platform,status,is_enabled,expires_at",
          )
          .eq("workspace_id", ws!)
          .in("platform", ["facebook", "instagram", "youtube", "tiktok", "x", "linkedin"])
          .order("display_name"),
        supabase
          .from("posts")
          .select(
            "id,updated_at,caption,status,scheduled_at,published_at,post_targets(id,social_account_id,status,platform,error,youtube_upload_bytes,youtube_upload_total_bytes),post_media(storage_path,kind,position)",
          )
          .eq("workspace_id", ws!)
          .order("updated_at", { ascending: false })
          .limit(500),
      ]);
      if (workspace.error) throw workspace.error;
      if (accounts.error) throw accounts.error;
      if (posts.error) throw posts.error;
      // Recent history is bounded, but scheduled posts must not disappear as drafts accumulate.
      const scheduled: Post[] = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from("posts").select(
          "id,updated_at,caption,status,scheduled_at,published_at,post_targets(id,social_account_id,status,platform,error,youtube_upload_bytes,youtube_upload_total_bytes),post_media(storage_path,kind,position)",
        ).eq("workspace_id", ws!).eq("status", "scheduled").order("id").range(offset, offset + 999);
        if (page.error) throw page.error;
        scheduled.push(...page.data as Post[]);
        if (page.data.length < 1000) break;
      }
      const items = [...new Map([...(posts.data as Post[]), ...scheduled].map(post => [post.id, post])).values()];
      const paths = [
        ...new Set(
          items.flatMap((post) =>
            post.post_media.map((media) => media.storage_path),
          ),
        ),
      ];
      const signed = paths.length
        ? await supabase.storage
            .from("post-media")
            .createSignedUrls(paths, 3600)
        : null;
      const urls = new Map(
        signed?.data?.map((item) => [item.path, item.signedUrl]) ?? [],
      );
      for (const post of items)
        post.post_media.sort((a, b) => a.position - b.position);
      for (const post of items)
        for (const media of post.post_media)
          media.url = urls.get(media.storage_path) ?? undefined;
      return {
        timezone: workspace.data.timezone || "UTC",
        requiresApproval: workspace.data.requires_approval === true,
        accounts: accounts.data as Account[],
        posts: items,
      };
    },
  });
  const tz = data?.timezone || "UTC";
  const { data: autoPlan, refetch: refetchAutoPlan } = useQuery({
    queryKey: ["publish-autopilot", ws],
    enabled: !!ws,
    queryFn: () => getPublishAutopilot({ data: { workspace_id: ws! } }),
  });
  const configureAuto = async (enabled: boolean) => {
    if (!ws) return;
    setBusy(true);
    try {
      await configurePublishAutopilot({
        data: {
          workspace_id: ws,
          account_ids: enabled
            ? [...autoAccounts]
            : autoPlan?.account_ids || [],
          source_post_ids: enabled
            ? [...autoSources]
            : autoPlan?.source_post_ids || [],
          timezone: tz,
          weekdays: enabled ? autoDays : autoPlan?.weekdays || [1, 3, 5],
          local_time: enabled
            ? autoTime
            : autoPlan?.local_time?.slice(0, 5) || "09:00",
          enabled,
        },
      });
      await refetchAutoPlan();
      await refresh();
      toast.success(
        enabled
          ? "Autopilot enabled for your approved library"
          : "Autopilot paused",
      );
      setAutopilotOpen(false);
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not update autopilot",
      );
    } finally {
      setBusy(false);
    }
  };
  const openAutopilot = () => {
    setAutoAccounts(
      new Set(
        autoPlan?.account_ids ||
          accounts
            .filter((account) => account.is_enabled)
            .map((account) => account.id),
      ),
    );
    setAutoSources(new Set(autoPlan?.source_post_ids || [...selected]));
    setAutoDays(autoPlan?.weekdays || [1, 3, 5]);
    setAutoTime(autoPlan?.local_time?.slice(0, 5) || "09:00");
    setAutopilotOpen(true);
  };
  useEffect(() => {
    setAccountId(null);
    setSelected(new Set());
    setPostId(null);
    setComposerOpen(false);
  }, [ws]);
  useEffect(() => {
    if (!ws || !requestedPostId) return;
    let active = true;
    void supabase.from("posts").select("id").eq("workspace_id", ws).eq("id", requestedPostId).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { toast.error("This post is unavailable in this workspace."); return; }
      setPostId(data.id);
      setComposerOpen(true);
    });
    return () => { active = false; };
  }, [ws, requestedPostId]);
  useEffect(() => {
    if (data?.timezone) setCursor(dateKey(new Date(), data.timezone));
  }, [data?.timezone]);
  const accounts = data?.accounts ?? [];
  const activeAccount =
    accounts.find((account) => account.id === accountId) || accounts[0];
  const days = useMemo(() => calendarDays(cursor, view), [cursor, view]);
  const filtered = (data?.posts ?? []).filter(
    (post) =>
      (!accountId ||
        post.post_targets.some(
          (target) => target.social_account_id === accountId,
        )) &&
      (!search || post.caption.toLowerCase().includes(search.toLowerCase())),
  );
  const drafts = filtered.filter((post) => post.status === "draft");
  const planned = filtered.filter(
    (post) => post.status !== "draft" && stamp(post),
  );
  const attention = filtered.filter((post) =>
    ["failed", "partially_published"].includes(outcome(post)),
  ).length;
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const openPost = (id: string | null = null, day?: string) => {
    setBatchOpen(false);
    setInitialScheduledAt(
      day ? new Date(workspaceInstant(day, "09:00", tz)) : null,
    );
    setPostId(id);
    setComposerOpen(true);
  };
  const closeComposer = (open: boolean) => {
    setComposerOpen(open);
    if (!open) {
      setInitialScheduledAt(null);
      void queryClient.invalidateQueries({ queryKey: ["publish-planner", ws] });
      setFeedRefresh((value) => value + 1);
    }
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["publish-planner", ws] });
  const move = async (
    post: Post,
    day: string,
    clock = time(post.scheduled_at || new Date().toISOString()),
  ) => {
    setBusy(true);
    try {
      await reschedulePublishPost({
        data: {
          post_id: post.id,
          scheduled_at: workspaceInstant(day, clock, tz),
        },
      });
      toast.success("Post rescheduled");
      setMovePost(null);
      await refresh();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not reschedule",
      );
    } finally {
      setBusy(false);
      setDragId(null);
    }
  };
  const duplicate = async (post: Post) => {
    setBusy(true);
    try {
      const result = await duplicatePublishPost({ data: { post_id: post.id } });
      await refresh();
      setCalendarPostId(null);
      openPost(result.post_id);
      toast.success("Copied to a new draft");
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not duplicate",
      );
    } finally {
      setBusy(false);
    }
  };
  const unschedule = async () => {
    if (!removePost) return;
    setBusy(true);
    try {
      await unschedulePublishPost({ data: { post_id: removePost.id } });
      setRemovePost(null);
      await refresh();
      toast.success("Removed from schedule and saved as a draft");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not remove post from schedule");
    } finally { setBusy(false); }
  };
  const scheduleBatch = async () => {
    setBusy(true);
    try {
      const result = await schedulePublishBatch({
        data: {
          post_ids: [...selected],
          first_at: workspaceInstant(slotDay, slotTime, tz),
          interval_hours: interval,
        },
      });
      await refresh();
      if (result.error)
        toast.error(result.scheduled.length + " scheduled. " + result.error);
      else {
        toast.success(result.scheduled.length + " posts scheduled");
        setSelected(new Set());
        setBatchOpen(false);
      }
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not schedule batch",
      );
    } finally {
      setBusy(false);
    }
  };
  const calendarPost = data?.posts.find(post => post.id === calendarPostId);
  const postActions = (post: Post, inDrawer = false) => {
    const actionClass = inDrawer
      ? "rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
      : "px-1 text-[10px] text-muted-foreground hover:text-foreground";
    return (
      <div className={inDrawer ? "flex flex-wrap items-center gap-2" : "mt-1 flex flex-wrap items-center gap-1"}>
        {["draft", "scheduled"].includes(post.status) && (
          <label className={cn("flex items-center gap-1 px-1 text-muted-foreground", inDrawer ? "text-sm" : "text-[10px]")}>
            <input
              type="checkbox"
              aria-label={"Select " + (post.caption || "untitled post")}
              checked={selected.has(post.id)}
              onChange={(event) =>
                setSelected((old) => {
                  const next = new Set(old);
                  if (event.target.checked) next.add(post.id);
                  else next.delete(post.id);
                  return next;
                })
              }
            />{" "}
            Select
          </label>
        )}
        {post.status === "scheduled" && (
          <button
            disabled={busy}
            onClick={() => {
              setCalendarPostId(null);
              setMovePost(post);
              setSlotDay(dateKey(post.scheduled_at!, tz));
              setSlotTime(time(post.scheduled_at!));
            }}
            className={actionClass}
          >
            Move
          </button>
        )}
        {post.status === "scheduled" && <button disabled={busy} onClick={() => { setCalendarPostId(null); setRemovePost(post); }} className={actionClass}>Remove from schedule</button>}
        <button
          disabled={busy}
          onClick={() => void duplicate(post)}
          className={cn(actionClass, !inDrawer && "ml-auto")}
        >
          Duplicate
        </button>
      </div>
    );
  };
  const postCard = (post: Post, compact = false, inCalendar = false) => {
    const status = outcome(post);
    const published = status === "published";
    const calendarPreview = post.status !== "draft";
    const when = stamp(post);
    return (
    <div key={post.id} className="relative">
      <button
        draggable={post.status === "scheduled" && !busy}
        onDragStart={() => setDragId(post.id)}
        onDragEnd={() => setDragId(null)}
        key={post.id}
        type="button"
        onClick={() => inCalendar ? setCalendarPostId(post.id) : openPost(post.id)}
        aria-label={calendarPreview ? `Open ${STATUS[status] || status} post${when ? ` on ${dateKey(when, tz)} at ${time(when)}` : ""}` : undefined}
        className={cn(
          "group w-full overflow-hidden rounded-xl border border-border text-left shadow-xs transition hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
          published ? "bg-muted text-muted-foreground" : "bg-background",
          compact ? "p-2" : "p-3",
        )}
      >
        {post.post_media[0]?.url && (
          <div
            className={cn(
              "mb-2 overflow-hidden rounded-lg bg-muted",
              inCalendar ? "aspect-square" : compact ? "h-16" : "h-28",
              published && "grayscale",
            )}
          >
            {post.post_media[0].kind === "video" ? (
              <video
                src={post.post_media[0].url}
                preload="metadata"
                muted
                className={cn("h-full w-full", calendarPreview ? "object-contain" : "object-cover")}
              />
            ) : post.post_media[0].kind === "document" ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"><FileText className="size-4" />Carousel PDF</div>
            ) : (
              <img
                src={post.post_media[0].url}
                alt=""
                className={cn("h-full w-full", calendarPreview ? "object-contain" : "object-cover")}
              />
            )}
          </div>
        )}
        {calendarPreview && !post.post_media[0]?.url && (
          <div className="mb-2 flex h-12 items-center justify-center rounded-lg bg-muted" title={post.post_media.length ? "Media preview unavailable" : "Text post"}>
            {post.post_media.length ? <ImagePlus className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
          </div>
        )}
        <div className="mb-1 flex items-center justify-between gap-1 text-[10px] font-medium text-muted-foreground">
          <span>{stamp(post) ? time(stamp(post)!) : "Ready to schedule"}</span>
          <span
            className={cn(
              "flex min-w-0 items-center gap-1",
              ["failed", "partially_published"].includes(status) &&
                "text-destructive",
            )}
          >
            {published && <Check className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{STATUS[status] || status}</span>
          </span>
        </div>
        {!calendarPreview && <p
          className={cn(
            "text-xs leading-relaxed",
            compact ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {post.caption || "Untitled post"}
        </p>}
        {post.post_targets.filter(t=>t.platform==='youtube').map(target=>{
          const progress=target.youtube_upload_total_bytes?Math.floor((target.youtube_upload_bytes??0)/target.youtube_upload_total_bytes*100):0;
          const problem=target.status==='failed'&&target.error;
          return <p key={target.id} className={cn("mt-1 text-[10px]",problem?"text-destructive":"text-muted-foreground")}>
            {problem ? `YouTube: ${target.error}` : target.status==='publishing'&&target.youtube_upload_total_bytes ? `YouTube upload: ${progress}%` : target.status==='publishing' ? "YouTube upload starting…" : target.status==='published' ? "YouTube upload accepted" : null}
          </p>;
        })}
        <div className={cn("mt-2 flex items-center -space-x-1", published && "grayscale")}>
          {post.post_targets.slice(0, 4).map((target) => {
            const account = accounts.find(
              (item) => item.id === target.social_account_id,
            );
            return account ? (
              <AccountAvatar
                key={target.id}
                account={account}
                className="h-5 w-5 text-[9px] ring-2 ring-background [&>svg]:h-3 [&>svg]:w-3"
              />
            ) : null;
          })}
          {post.post_media.length > 1 && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {post.post_media.length} assets
            </span>
          )}
        </div>
      </button>
      {!inCalendar && postActions(post)}
    </div>
    );
  };
  const planner = (
    <div className="flex h-full min-h-0 flex-col bg-surface-subtle/40">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-3">
        <div className="mr-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous period"
            onClick={() => setCursor(shiftCursor(cursor, view, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">
            {new Intl.DateTimeFormat("en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${cursor}T12:00:00Z`))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next period"
            onClick={() => setCursor(shiftCursor(cursor, view, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(dateKey(new Date(), tz))}
          >
            Today
          </Button>
        </div>
        <div className="flex rounded-lg bg-muted p-1">
          {(["week", "month", "agenda"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs capitalize",
                view === mode && "bg-background font-semibold shadow-xs",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isPending ? (
          <div className="animate-pulse space-y-3 p-5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 rounded-xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="m-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
          >
            Could not load your planner. {error.message}
            <Button
              className="mt-3 block"
              variant="outline"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : view === "agenda" ? (
          <div className="space-y-5 p-4">
            {days.map((day) => (
              <section key={day}>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                  {new Intl.DateTimeFormat("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${day}T12:00:00Z`))}
                </h3>
                <div className="space-y-2">
                  {planned
                    .filter((post) => dateKey(stamp(post)!, tz) === day)
                    .map((post) => postCard(post))}
                  {!planned.some(
                    (post) => dateKey(stamp(post)!, tz) === day,
                  ) && (
                    <button
                      onClick={() => openPost(null, day)}
                      className="w-full rounded-xl border border-dashed p-4 text-left text-xs text-muted-foreground hover:bg-muted"
                    >
                      + Create a post
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-7",
              view === "week" && "min-h-full min-w-[560px]",
            )}
          >
            {days.map((day) => {
              const today = day === dateKey(new Date(), tz);
              const items = planned
                .filter((post) => dateKey(stamp(post)!, tz) === day)
                .sort((a, b) => stamp(a)!.localeCompare(stamp(b)!));
              return (
                <section
                  key={day}
                  onDragOver={(event) => {
                    if (dragId) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const post = planned.find((item) => item.id === dragId);
                    if (post) void move(post, day);
                  }}
                  className={cn(
                    "min-w-0 border-b border-r border-border/70 p-2",
                    view === "month" ? "min-h-28" : "min-h-96",
                    today && "bg-primary/[0.03]",
                    day.slice(0, 7) !== cursor.slice(0, 7) &&
                      view === "month" &&
                      "opacity-50",
                  )}
                >
                  <div className="mb-3 flex flex-col items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "short",
                        timeZone: "UTC",
                      }).format(new Date(`${day}T12:00:00Z`))}
                    </span>
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                        today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {Number(day.slice(-2))}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((post) => postCard(post, true, true))}
                    <button
                      type="button"
                      aria-label={`Create post for ${day}`}
                      onClick={() => openPost(null, day)}
                      className="flex h-8 w-full items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
  const feeds = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Radio className="h-4 w-4 text-primary" />
        </span>
        <div className="mr-auto">
          <h2 className="text-sm font-semibold">{activeAccount ? "Your live feeds" : "Connect your socials"}</h2>
          <p className="text-[11px] text-muted-foreground">
            {activeAccount ? "Published content, straight from your accounts" : "Connect the accounts you want to use in Publish"}
          </p>
        </div>
        {activeAccount && <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh live feed"
          onClick={() => setFeedRefresh((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>}
      </div>
      {isPending ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading your accounts…</div> : activeAccount ? (
        <>
          <div className="flex flex-wrap gap-2 border-b p-3" role="group" aria-label="Feed account">
              {accounts.map((account) => (
                <button key={account.id} type="button" aria-pressed={activeAccount.id === account.id} onClick={() => setAccountId(account.id)} className={cn("rounded-full border px-4 py-2 text-sm transition-colors", activeAccount.id === account.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                  {account.display_name || account.handle} · {account.platform}
                </button>
              ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {["facebook", "instagram", "x", "youtube", "tiktok"].includes(activeAccount.platform) ? <NativeAccountFeed
              key={`${activeAccount.id}-${feedRefresh}`}
              socialAccountId={activeAccount.id}
              fallbackName={
                activeAccount.display_name ||
                activeAccount.handle ||
                "Your account"
              }
              fallbackHandle={activeAccount.handle}
              fallbackAvatar={activeAccount.avatar_url}
              platform={activeAccount.platform as FeedPlatform}
            /> : <p className="text-sm text-muted-foreground">Native feed is unavailable for this account. Scheduled posts appear in the calendar and queue.</p>}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto"><SocialConnectionsPage embedded onAccountsChanged={() => { void refresh(); }} /></div>
      )}
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b px-5 py-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Send className="h-3.5 w-3.5" /> YOUR SOCIAL WORKSPACE
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Publish</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Great content. The right moment. Every account.
            </p>
          </div>
          {ws && data && <UpcomingScheduleEditor key={ws} workspaceId={ws}
            accounts={accounts} posts={data.posts} timezone={tz}
            requiresApproval={data.requiresApproval} autopilotAccounts={autoPlan?.enabled ? autoPlan.account_ids : []}
            refresh={() => Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ["asset-publishing-status", ws] })])} />}
          <Button variant="outline" onClick={() => openSchedule()}>
            <CalendarDays className="mr-2 h-4 w-4" /> Publish content
          </Button>
          <Button onClick={() => openPost()}>
            <Plus className="mr-2 h-4 w-4" /> New post
          </Button>
        </div>
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setAccountId(null)}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-xs font-medium",
              !accountId && "border-primary bg-primary/5",
            )}
          >
            All accounts{" "}
            <span className="ml-1 text-muted-foreground">
              {accounts.length}
            </span>
          </button>
          {accounts.map((account) => {
            const healthy =
              account.is_enabled &&
              !["error", "expired", "disconnected"].includes(account.status) &&
              (["youtube", "x"].includes(account.platform) || !account.expires_at ||
                new Date(account.expires_at) > new Date());
            return (
              <button
                key={account.id}
                onClick={() => setAccountId(account.id)}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left",
                  accountId === account.id && "border-primary bg-primary/5",
                )}
              >
                <AccountAvatar account={account} />
                <span>
                  <span className="block max-w-36 truncate text-xs font-medium">
                    {account.display_name || account.handle}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-[10px]",
                      healthy ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {account.platform === "linkedin" ? "LinkedIn" : account.platform === "x" ? "X" : account.platform === "facebook" ? "Facebook" : account.platform === "instagram" ? "Instagram" : account.platform === "youtube" ? "YouTube" : "TikTok"} · {healthy
                      ? "Connected"
                      : account.is_enabled
                        ? "Reconnect needed"
                        : "Publishing restricted"}
                  </span>
                </span>
              </button>
            );
          })}
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link to="/app/settings/connections">
              <Plus className="mr-1 h-3.5 w-3.5" /> Connect
            </Link>
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="relative max-w-72 flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a post or draft…"
              aria-label="Search posts and drafts"
              className="h-9 pl-9 text-xs"
            />
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> {tz}
          </span>
          {attention > 0 && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> {attention} need attention
            </span>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label="More schedule actions" title="More schedule actions">
                <Ellipsis className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={openAutopilot}>Autopilot{autoPlan?.enabled ? " · On" : ""}</DropdownMenuItem>
              <DropdownMenuItem disabled={(!selected.size && !drafts.length) || busy} onSelect={() => setBatchOpen(true)}>
                Batch schedule{selected.size ? ` (${selected.size})` : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSamOpen(true)}>Ask Sam</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <PublishingOverview posts={data?.posts ?? []} timezone={tz} onOpen={id => openPost(id)} />
      <div className="flex shrink-0 border-b p-2 lg:hidden">
        {(["planner", "feeds"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm capitalize",
              mobileTab === tab && "bg-muted font-semibold",
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      {wide ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="50%" minSize="35%">
              {planner}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%" minSize="30%">
              {feeds}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {mobileTab === "planner" ? planner : feeds}
        </div>
      )}
      {calendarPost?.status === "scheduled" && <ComposerDrawer key={calendarPost.id} open postId={calendarPost.id} onOpenChange={open => {
        if (!open) { setCalendarPostId(null); closeComposer(false); }
      }}>
        <div className="border-t px-6 py-4">{postActions(calendarPost, true)}</div>
      </ComposerDrawer>}
      <Sheet open={!!calendarPost && calendarPost.status !== "scheduled"} onOpenChange={open => { if (!open) setCalendarPostId(null); }}>
        <SheetContent className="overflow-y-auto">
          <SheetTitle>Post details</SheetTitle>
          {calendarPost && (
            <div className="mt-4 space-y-4">
              {stamp(calendarPost) && <p className="text-sm text-muted-foreground">{new Date(stamp(calendarPost)!).toLocaleString("en-GB", { timeZone: tz, dateStyle: "long", timeStyle: "short" })} · {tz}</p>}
              <Button disabled={busy} onClick={() => { setCalendarPostId(null); openPost(calendarPost.id); }}>Edit post</Button>
              {postActions(calendarPost, true)}
              <p className="whitespace-pre-wrap break-words text-sm">{calendarPost.caption}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={!!removePost} onOpenChange={open => { if (!open && !busy) setRemovePost(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove from schedule?</AlertDialogTitle><AlertDialogDescription>The post and its media will remain in drafts. It will no longer be published automatically.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep scheduled</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void unschedule(); }}>Remove from schedule</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Sheet
        open={batchOpen || !!movePost}
        onOpenChange={(open) => {
          if (!open) {
            setBatchOpen(false);
            setMovePost(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetTitle>
            {movePost ? "Move post" : "Schedule selected posts"}
          </SheetTitle>
          <p className="mt-3 text-sm text-muted-foreground">
            {movePost
              ? "Keep your content and destinations; choose its new time."
              : "Choose drafts or use the posts you selected from the calendar. Posts use their saved destinations and are scheduled in selection order."}{" "}
            Times in {tz}.
          </p>
          {!movePost && !!drafts.length && (
            <section className="mt-4" aria-label="Draft posts">
              <h3 className="mb-2 text-sm font-semibold">Draft posts</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {drafts.map((post) => <div key={post.id} className="w-40 shrink-0">{postCard(post, true)}</div>)}
              </div>
            </section>
          )}
          <label className="mt-6 block text-sm">
            {movePost ? "Date" : "First date"}
            <Input
              type="date"
              value={slotDay}
              onChange={(event) => setSlotDay(event.target.value)}
              className="mt-2"
            />
          </label>
          <label className="mt-4 block text-sm">
            Time
            <Input
              type="time"
              value={slotTime}
              onChange={(event) => setSlotTime(event.target.value)}
              className="mt-2"
            />
          </label>
          {!movePost && (
            <label className="mt-4 block text-sm">
              Hours between posts
              <Input
                type="number"
                min={1}
                max={168}
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
                className="mt-2"
              />
            </label>
          )}
          <Button
            className="mt-6 w-full"
            disabled={busy || !slotDay || !slotTime || (!movePost && !selected.size)}
            onClick={() =>
              movePost
                ? void move(movePost, slotDay, slotTime)
                : void scheduleBatch()
            }
          >
            {busy
              ? "Saving…"
              : movePost
                ? "Confirm new time"
                : "Schedule " + selected.size + " posts"}
          </Button>
        </SheetContent>
      </Sheet>
      <Sheet open={autopilotOpen} onOpenChange={setAutopilotOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetTitle>Autopilot</SheetTitle>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Keep the next seven days filled using only the content you authorise
            here. Each asset is used once per account. Empty library slots stay
            empty.
          </p>
          {accounts.some((account) => ["youtube", "x", "linkedin"].includes(account.platform)) && <p className="mt-2 text-sm text-muted-foreground">Review and schedule YouTube, X and LinkedIn posts individually. Autopilot currently supports Facebook and Instagram.</p>}
          <h3 className="mb-2 mt-6 text-sm font-semibold">Publish to</h3>
          <div className="space-y-2">
            {accounts.filter((account) => ["facebook", "instagram"].includes(account.platform)).map((account) => (
              <label
                key={account.id}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={autoAccounts.has(account.id)}
                  disabled={!account.is_enabled}
                  onChange={(event) =>
                    setAutoAccounts((old) => {
                      const next = new Set(old);
                      if (event.target.checked) next.add(account.id);
                      else next.delete(account.id);
                      return next;
                    })
                  }
                />
                {account.display_name || account.handle} · {account.platform}
              </label>
            ))}
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold">Approved library</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Selecting a draft here authorises it for autopilot. Its saved
            caption and media will be used.
          </p>
          <div className="max-h-48 space-y-2 overflow-auto">
            {(data?.posts || [])
              .filter(
                (post) => post.status === "draft" || autoSources.has(post.id),
              )
              .map((post) => (
                <label
                  key={post.id}
                  className="flex items-start gap-2 rounded-lg border p-3 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={autoSources.has(post.id)}
                    onChange={(event) =>
                      setAutoSources((old) => {
                        const next = new Set(old);
                        if (event.target.checked) next.add(post.id);
                        else next.delete(post.id);
                        return next;
                      })
                    }
                  />
                  <span className="line-clamp-2">
                    {post.caption || "Untitled draft"}
                  </span>
                </label>
              ))}
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold">Posting days</h3>
          <div className="flex flex-wrap gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <button
                  key={day}
                  aria-pressed={autoDays.includes(index)}
                  onClick={() =>
                    setAutoDays((old) =>
                      old.includes(index)
                        ? old.filter((value) => value !== index)
                        : [...old, index],
                    )
                  }
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs",
                    autoDays.includes(index) && "border-primary bg-primary/10",
                  )}
                >
                  {day}
                </button>
              ),
            )}
          </div>
          <label className="mt-4 block text-sm">
            Posting time · {tz}
            <Input
              type="time"
              value={autoTime}
              onChange={(event) => setAutoTime(event.target.value)}
              className="mt-2"
            />
          </label>
          <p className="mt-5 rounded-xl bg-muted p-3 text-xs leading-relaxed">
            Enabling authorises scheduled publication of these assets to these
            accounts on the selected days. Changes to this plan require you to
            confirm again.
          </p>
          <Button
            className="mt-4 w-full"
            disabled={
              busy ||
              !autoAccounts.size ||
              !autoSources.size ||
              !autoDays.length ||
              !autoTime
            }
            onClick={() => void configureAuto(true)}
          >
            {busy
              ? "Saving…"
              : autoPlan?.enabled
                ? "Confirm updated plan"
                : "Enable autopilot"}
          </Button>
          {autoPlan?.enabled && (
            <Button
              variant="outline"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => void configureAuto(false)}
            >
              Pause autopilot
            </Button>
          )}
        </SheetContent>
      </Sheet>
      <ComposerDrawer
        open={composerOpen}
        onOpenChange={closeComposer}
        postId={postId}
        initialScheduledAt={initialScheduledAt}
        onPostIdChange={setPostId}
      />
      <Sheet open={samOpen} onOpenChange={setSamOpen}>
        <SheetContent className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Ask Sam about publishing</SheetTitle>
          <SamPane onOpenNav={() => setSamOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
