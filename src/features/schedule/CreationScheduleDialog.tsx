import { scheduleCaptionWithHashtags } from "@/lib/schedule-caption-hashtags";
import { ScheduleTilePreview, type ScheduleTile } from "./ScheduleTilePreview";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CircleCheck, CircleX, Clock3, Maximize2, PanelRightClose, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/client-social-profiles";
import { ScheduleDateTimePicker } from "./ScheduleDateTimePicker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { suggestPostingCadence, getScheduleTileCaptions, getCreationScheduleStatus, prepareCreationSchedule, scheduleCreations } from "@/lib/creation-schedule.functions";
import { channelStatusLabel, useAssetPublishingStatus } from "./useAssetPublishingStatus";
import { refreshExpiredSlots, weekdayScheduleSlots, daytimeScheduleSlots, dailyScheduleSlots, dateKey, workspaceInstant } from "./planner";
import { ScheduleReview } from "./ScheduleReview";
import { listLinkedInCarousels } from "@/lib/linkedin-carousel.functions";
import { ScheduleAssetGallery, VideoReview } from "./ScheduleAssetGallery";
import { ScheduleCarouselPreviewDialog } from "./ScheduleCarouselPreview";
import { contentTrashKey, listContentTrash } from "@/lib/content-trash";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ScheduleCommand } from "./ScheduleDialogHost";
import { clearScheduleDraft, readScheduleDraft, writeScheduleDraft } from "./scheduleDraft";
import { fitScheduleSlots } from "./free-slots";
import { getScheduleBookings } from "@/lib/schedule-bookings.functions";
import { AssetWorkflow } from "@/features/create/AssetWorkflow";

export type CampaignScheduleRow = { postId: string; type: "tile" | "written" | "video"; assetId: string; date: string; platform: string; caption: string };

type Account = { id: string; platform: string; display_name: string | null; handle: string | null; status: string; is_enabled: boolean; expires_at: string | null };
type Creation = ScheduleTile & { type: "tile" | "video" | "written" | "carousel"; renderId?: string; text?: string; status?: string };
type PlanItem = { type: "tile" | "video" | "written" | "carousel"; id: string; title: string; revision?: string | undefined; source_caption?: string | undefined; scheduled_at: string; captions: Record<string, string>; account_ids: string[]; repeat_accounts?: string[] | undefined };
type ScheduleRequest = { workspace_id: string; items: Array<Omit<PlanItem, "title"> & { immediate: boolean }>; account_ids: string[]; request_id: string; confirmed: true };
type SchedulePreferences = { cadence: "daily" | "ai"; excludeWeekends: boolean; timezone: string; day: string; clock: string; startNow: boolean };
type ResultRow = { title: string; detail: string; outcome: "Scheduled" | "Accepted" | "Not scheduled" | "Awaiting confirmation" };
function resultTime(instant: string, timezone: string) {
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(instant));
  return date + " · " + (timezone === "Europe/London" ? "UK time" : timezone);
}

export function CreationScheduleDialog({ open, onOpenChange, workspaceId, campaignRows, timezone: workspaceZone, accounts, initialTileIds, initialVideoIds = [], initialWrittenIds = [], onScheduled, mode = "dialog", onModeChange, command, onCommandHandled, onSelectionCountChange, selectionScope, onLockChange }: { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; campaignRows?: CampaignScheduleRow[]; timezone: string; accounts: Account[]; initialTileIds: string[]; initialVideoIds?: string[]; initialWrittenIds?: string[]; onScheduled: () => void; mode?: "pane" | "dialog"; onModeChange?: (mode: "pane" | "dialog" | null) => void; command?: ScheduleCommand | null; onCommandHandled?: (sequence: number) => void; onSelectionCountChange?: ((count: number) => void) | undefined; selectionScope?: string | undefined; onLockChange?: ((locked: boolean) => void) | undefined }) {
  const { user } = useAuth();
  const [draftReadyKey, setDraftReadyKey] = useState<string | null>(null);
  const [paneView, setPaneView] = useState<"selection" | "browse">(selectionScope ? "selection" : "browse");
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingAddition, setPendingAddition] = useState<string[] | null>(null);
  const [repeatAddition, setRepeatAddition] = useState<string[] | null>(null);
  const [checkingAddition, setCheckingAddition] = useState(false);
  const seenCommand = useRef<number | null>(null);
  const [chosenDestinations, setDestinations] = useState<string[]>([]);
  const [timezone, setTimezone] = useState(workspaceZone);
  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [settings, setSettings] = useState<SchedulePreferences | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [day, setDay] = useState(() => dateKey(new Date(Date.now() + 86400000), timezone));
  const [startNow, setStartNow] = useState(false);
  const [cadence, setCadence] = useState<"daily" | "ai">("daily");
  const suggestCadence = useServerFn(suggestPostingCadence);
  const [clock, setClock] = useState("09:00");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [assumptions, setAssumptions] = useState("");
  const [busy, setBusy] = useState(false);
  const previousReview = useRef<{ items: PlanItem[]; destinations: string[] } | null>(null);
  const preparing = useRef<AbortController | null>(null);
  const [preparedCount, setPreparedCount] = useState(0);
  const [prepareError, setPrepareError] = useState("");
  useEffect(() => {
    previousReview.current = null;
    setPrepareError("");
    return () => { preparing.current?.abort(); };
  }, [open, workspaceId, user?.id, campaignRows?.[0]?.assetId]);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    onLockChange?.(busy || uncertain);
    return () => onLockChange?.(false);
  }, [busy, uncertain, onLockChange]);
  const [report, setReport] = useState<{ rows: ResultRow[]; resolved: boolean; uncertain: boolean } | null>(null);
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const pendingRequest = useRef<ScheduleRequest | null>(null);
  const confirming = useRef(false);
  const listCarousels = useServerFn(listLinkedInCarousels);
  const lookupCaptions = useServerFn(getScheduleTileCaptions);
  const [previewTile, setPreviewTile] = useState<Creation | null>(null);
  const prepare = useServerFn(prepareCreationSchedule);
  const schedule = useServerFn(scheduleCreations);
  const checkStatus = useServerFn(getCreationScheduleStatus);
  const getBookings = useServerFn(getScheduleBookings);
  const initialCampaignFit = useRef(false);
  async function bookingsFor(slots: string[]) {
    const times = slots.map(Date.parse);
    if (!times.length || times.some(time => !Number.isFinite(time))) throw new Error("Choose valid schedule times.");
    const from = Math.min(...times) - 2 * 3600000;
    const until = Math.max(...times) + 368 * 86400000;
    const bookings: Array<{ post_id: string; scheduled_at: string; account_ids: string[] }> = [];
    for (let cursor = from; cursor < until; cursor += 390 * 86400000) {
      bookings.push(...await getBookings({ data: { workspace_id: workspaceId, from: new Date(cursor).toISOString(), until: new Date(Math.min(until, cursor + 390 * 86400000)).toISOString() } }));
    }
    return bookings;
  }
  async function reviewedBookings(plan: PlanItem[], immediate: boolean) {
    // Fetch only the reviewed minutes, merging nearby windows to avoid a long date-range scan.
    const windows = plan.map((item, index) => {
      const time = immediate && index === 0 ? Date.now() : Date.parse(item.scheduled_at);
      if (!Number.isFinite(time)) throw new Error("Choose valid schedule times.");
      const minute = Math.floor(time / 60000) * 60000;
      return { from: minute - 60000, until: minute + 120000 };
    }).sort((a, b) => a.from - b.from);
    const merged: typeof windows = [];
    for (const window of windows) {
      const last = merged.at(-1);
      if (last && window.from <= last.until) last.until = Math.max(last.until, window.until);
      else merged.push({ ...window });
    }
    const pages = await Promise.all(merged.map(window => getBookings({ data: { workspace_id: workspaceId, from: new Date(window.from).toISOString(), until: new Date(window.until).toISOString() } })));
    return pages.flat();
  }
  function hasConflict(plan: PlanItem[], occupied: Array<{ post_id: string; scheduled_at: string; account_ids: string[] }>, immediate: boolean) {
    const now = Date.now();
    return plan.some((item, index) => {
      const minute = Math.floor((immediate && index === 0 ? now : Date.parse(item.scheduled_at)) / 60000);
      const shares = (ids: string[]) => ids.some(id => item.account_ids.includes(id));
      return occupied.some(row => Math.floor(Date.parse(row.scheduled_at) / 60000) === minute && shares(row.account_ids)) ||
        plan.some((other, otherIndex) => otherIndex !== index && Math.floor((immediate && otherIndex === 0 ? now : Date.parse(other.scheduled_at)) / 60000) === minute && shares(other.account_ids));
    });
  }
  async function fitPlan(plan: PlanItem[], prefs: SchedulePreferences) {
    const original = plan.map(item => item.scheduled_at);
    const occupied = await bookingsFor(original);
    const fitted = fitScheduleSlots(original, plan.map(item => item.account_ids), occupied, { timezone: prefs.timezone, daily: prefs.cadence === "daily", excludeWeekends: prefs.excludeWeekends, startNow: prefs.startNow });
    return plan.map((item, index) => ({ ...item, scheduled_at: fitted[index]! }));
  }
  const onlyCarousels = selected.length > 0 && selected.every(key => key.startsWith("carousel:"));
  const destinations = onlyCarousels ? chosenDestinations.filter(id => accounts.some(a => a.id === id && a.platform === "linkedin")) : chosenDestinations;
  const usable = accounts.filter(a => (!onlyCarousels || a.platform === "linkedin") && ["facebook", "instagram", "x", "linkedin"].includes(a.platform) && a.is_enabled && a.status === "connected" && (a.platform === "x" || !a.expires_at || Date.parse(a.expires_at) > Date.now()));
  // A workspace can have both a personal LinkedIn profile and a Company Page.
  const multipleLinkedIn = usable.filter(account => account.platform === "linkedin").length > 1;
  const defaultDestinations = multipleLinkedIn ? usable.filter(account => account.platform !== "linkedin") : usable;
  const draftScope = selectionScope ?? (campaignRows?.length ? workspaceId + ":campaign:" + campaignRows.map(row => row.assetId).join(",") : workspaceId);
  useEffect(() => { if (!open || !user?.id) { setDraftReadyKey(null); return; } const draft = readScheduleDraft(user.id, draftScope, workspaceId); setSettings(null); setTimezone(draft?.timezone ?? workspaceZone); setExcludeWeekends(draft?.excludeWeekends ?? false); setCadence(draft?.cadence ?? "daily"); if (draft) { setSelected(draft.selected); setDestinations(draft.destinations); setDay(draft.day); setClock(draft.clock); setItems(draft.items); setAssumptions(draft.assumptions); setStartNow(draft.startNow); setUncertain(draft.uncertain); setRequestId(draft.requestId); pendingRequest.current = draft.pendingRequest; } else if (campaignRows?.length) {
      const plan = campaignRows.map(row => {
        const matching = usable.filter(account => account.platform === row.platform);
        return { type: row.type, id: row.assetId, title: row.caption.split("\n")[0] || "Campaign post",
          ...(row.type === "written" ? { source_caption: row.caption } : {}),
          scheduled_at: workspaceInstant(row.date, "09:00", workspaceZone), captions: { [row.platform]: scheduleCaptionWithHashtags(row.caption, row.platform) },
          account_ids: matching.length === 1 ? [matching[0]!.id] : [], repeat_accounts: [] };
      });
      initialCampaignFit.current = true; setItems(plan); setSelected(plan.map(item => item.type + ":" + item.id));
      setDestinations(defaultDestinations.filter(account => campaignRows.some(row => row.platform === account.platform)).map(a => a.id));
      setStartNow(false); setAssumptions("Campaign dates at 09:00 in " + workspaceZone + ". Review times and destinations before scheduling.");
      setUncertain(false); setRequestId(crypto.randomUUID()); pendingRequest.current = null;
    } else { setSelected([...initialTileIds.map(id => `tile:${id}`), ...initialVideoIds.map(id => `video:${id}`), ...initialWrittenIds.map(id => `written:${id}`)]); setDestinations(defaultDestinations.map(a => a.id)); setItems(null); setStartNow(false); setUncertain(false); setRequestId(crypto.randomUUID()); pendingRequest.current = null; } setDraftReadyKey(`${user.id}:${draftScope}`); }, [open, workspaceId, draftScope, user?.id]);
  useEffect(() => { if (open && user?.id && draftReadyKey === `${user.id}:${draftScope}`) writeScheduleDraft(user.id, draftScope, { selected, destinations: chosenDestinations, day, clock, startNow, cadence, timezone, excludeWeekends, items, assumptions, uncertain, requestId, pendingRequest: pendingRequest.current }); }, [open, draftReadyKey, user?.id, workspaceId, selected, chosenDestinations, day, clock, startNow, cadence, timezone, excludeWeekends, items, assumptions, uncertain, requestId]);
  useEffect(() => { if (open && draftReadyKey === `${user?.id}:${draftScope}`) onSelectionCountChange?.(selected.length); }, [open, draftReadyKey, user?.id, workspaceId, selected.length, onSelectionCountChange]);
  const trash = useQuery({ queryKey: contentTrashKey(workspaceId, "tile"), enabled: open && !!workspaceId, queryFn: () => listContentTrash(workspaceId, "tile") });
  const writtenTrash = useQuery({ queryKey: contentTrashKey(workspaceId, "written"), enabled: open && !!workspaceId, queryFn: () => listContentTrash(workspaceId, "written") });
  const carouselTrash = useQuery({ queryKey: contentTrashKey(workspaceId, "carousel"), enabled: open && !!workspaceId, queryFn: () => listContentTrash(workspaceId, "carousel") });
  const trashedKeys = useMemo(() => new Set([
    ...(trash.data ?? []).map(id => `tile:${id}`),
    ...(writtenTrash.data ?? []).map(id => `written:${id}`),
    ...(carouselTrash.data ?? []).map(id => `carousel:${id}`),
  ]), [trash.data, writtenTrash.data, carouselTrash.data]);
  useEffect(() => {
    if (!open || busy || uncertain || !trashedKeys.size || draftReadyKey !== `${user?.id}:${draftScope}`) return;
    const keepKey = (key: string) => !trashedKeys.has(key);
    if (selected.some(key => !keepKey(key))) setSelected(selected.filter(keepKey));
    if (items?.some(item => trashedKeys.has(`${item.type}:${item.id}`))) {
      const remaining = items.filter(item => !trashedKeys.has(`${item.type}:${item.id}`));
      if (remaining[0] !== items[0]) setStartNow(false);
      setItems(remaining.length ? remaining : null);
    }
  }, [open, busy, uncertain, trashedKeys, selected, items, draftReadyKey, user?.id, draftScope]);
  const selectedTileIds = selected.filter(key => key.startsWith("tile:")).map(key => key.slice(5));
  const selectedVideoIds = selected.filter(key => key.startsWith("video:")).map(key => key.slice(6));
  const selectedWrittenIds = selected.filter(key => key.startsWith("written:")).map(key => key.slice(8));
  const carousels = useQuery({ queryKey: ["linkedin-carousels", workspaceId], enabled: open && !!workspaceId, queryFn: () => listCarousels({ data: { workspace_id: workspaceId } }) });
  const library = useQuery({ queryKey: ["schedule-creations", workspaceId, selectedTileIds, selectedVideoIds, selectedWrittenIds], enabled: open && !!workspaceId, queryFn: async () => {
    const [tiles, videos, chosen, chosenVideos, written, chosenWritten] = await Promise.all([
      supabase.from("brand_files").select("id,name,storage_path").eq("workspace_id", workspaceId).eq("source", "social_tile").order("created_at", { ascending: false }).limit(200),
      supabase.from("creative_variants").select("id,hook,narrative,review_state,primary_render_id,render_jobs!render_jobs_variant_id_fkey(id,status,storage_path)").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(200),
      selectedTileIds.length ? supabase.from("brand_files").select("id,name,storage_path").eq("workspace_id", workspaceId).eq("source", "social_tile").in("id", selectedTileIds) : Promise.resolve({ data: [], error: null }),
      selectedVideoIds.length ? supabase.from("creative_variants").select("id,hook,narrative,review_state,primary_render_id,render_jobs!render_jobs_variant_id_fkey(id,status,storage_path)").eq("workspace_id", workspaceId).in("id", selectedVideoIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("posts").select("id,caption,status,created_via,post_media(id)").eq("workspace_id", workspaceId).in("status", ["draft", "scheduled", "published", "partially_published"]).is("variant_id", null).or("created_via.like.personal-idea-batch:%,created_via.eq.written_posts,created_via.is.null").order("created_at", { ascending: false }).limit(200),
      selectedWrittenIds.length ? supabase.from("posts").select("id,caption,status,created_via,post_media(id)").eq("workspace_id", workspaceId).in("status", ["draft", "scheduled", "published", "partially_published"]).is("variant_id", null).in("id", selectedWrittenIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (tiles.error || videos.error || chosen.error || chosenVideos.error || written.error || chosenWritten.error) throw tiles.error || videos.error || chosen.error || chosenVideos.error || written.error || chosenWritten.error;
    const valid = [...new Map([...(chosen.data ?? []), ...(tiles.data ?? [])].filter(t => t.storage_path.startsWith(`${workspaceId}/`)).map(t => [t.id, t])).values()];
    const captions = valid.length ? await lookupCaptions({ data: { workspace_id: workspaceId, tile_ids: valid.map(t => t.id) } }) : {};
    const signed = valid.length ? await supabase.storage.from("brand-assets-private").createSignedUrls(valid.map(t => t.storage_path), 3600) : null;
    const urls = new Map(signed?.data?.map(x => [x.path, x.signedUrl]) ?? []);
    return [...valid.map(t => ({ type: "tile" as const, id: t.id, title: t.name.replace(/\.[^.]+$/, ""), url: urls.get(t.storage_path) ?? undefined, savedCaption: captions[t.id] })), ...[...new Map([...(chosenVideos.data ?? []), ...(videos.data ?? [])].filter(v => v.review_state === "approved" && v.render_jobs?.some(r => r.id === v.primary_render_id && r.status === "done" && !!r.storage_path)).map(v => [v.id, v])).values()].map(v => ({ type: "video" as const, id: v.id, renderId: v.primary_render_id ?? undefined, title: v.hook || v.narrative || "Video" })), ...[...new Map([...(chosenWritten.data ?? []), ...(written.data ?? [])].filter(p => p.caption.trim() && !p.post_media.length && (p.created_via === null || p.created_via === "written_posts" || p.created_via.startsWith("personal-idea-batch:"))).map(p => [p.id, p])).values()].map(p => ({ type: "written" as const, id: p.id, title: p.caption, text: p.caption, status: p.status }))] as Creation[];
  } });
  const carouselCreations = useMemo(() => (carousels.data ?? []).filter(deck => deck.complete && !deck.unreadable).map(deck => ({
    type: "carousel" as const, id: deck.id, title: deck.title, url: deck.coverUrl ?? undefined,
  })), [carousels.data]);
  const publishing = useAssetPublishingStatus(workspaceId, (library.data ?? []).filter(c => c.type === "tile").map(c => c.id), (library.data ?? []).filter(c => c.type === "video").map(c => c.id), (library.data ?? []).filter(c => c.type === "written").map(c => c.id), carouselCreations.map(c => c.id));
  const commandKeys = command?.keys ?? [];
  const commandHistory = useAssetPublishingStatus(workspaceId, commandKeys.filter(k => k.startsWith("tile:")).map(k => k.slice(5)), commandKeys.filter(k => k.startsWith("video:")).map(k => k.slice(6)), commandKeys.filter(k => k.startsWith("written:")).map(k => k.slice(8)), commandKeys.filter(k => k.startsWith("carousel:")).map(k => k.slice(9)));
  const stateRef = useRef({ selected, uncertain, busy, items, report });
  stateRef.current = { selected, uncertain, busy, items, report };
  const activeHistory = (history: Record<string, { status: string }[]>, key: string) => (history[key.slice(key.indexOf(":") + 1)] ?? []).some(status => !["failed", "skipped"].includes(status.status));
  const addChecked = (keys: string[], history: Record<string, { status: string }[]>, knownPreviouslyPublished = false) => {
    const state = stateRef.current; const fresh = [...new Set(keys)].filter(key => !state.selected.includes(key));
    if (!fresh.length) return;
    if (state.uncertain || state.busy || pendingRequest.current || state.report) { toast.error("Finish or safely resolve the current scheduling request before adding more content."); return; }
    if (state.selected.length + fresh.length > 20) { toast.error("A schedule can contain up to 20 items. Remove some items before adding more."); return; }
    if (knownPreviouslyPublished || fresh.some(key => activeHistory(history, key))) { setRepeatAddition(fresh); return; }
    if (state.items) setPendingAddition(fresh);
    else { setSelected(current => [...current, ...fresh]); toast.success(fresh.length === 1 ? "Added to schedule" : `Added ${fresh.length} items to schedule`); }
  };
  useEffect(() => {
    if (!command || command.sequence === seenCommand.current || !open || !user?.id || draftReadyKey !== `${user.id}:${draftScope}` || pendingAddition || repeatAddition) return;
    seenCommand.current = command.sequence;
    if (command.focus) setPaneView("selection");
    let active = true;
    void commandHistory.refetch().then(result => {
      if (!active) return;
      if (result.isError || !result.data) toast.error("Publishing history is unavailable. Try again before adding content.");
      else addChecked(command.keys, result.data, !!command.knownPreviouslyPublished);
      onCommandHandled?.(command.sequence);
    }).catch(() => { if (active) { toast.error("Publishing history is unavailable. Try again before adding content."); onCommandHandled?.(command.sequence); } });
    return () => { active = false; };
  }, [command?.sequence, open, user?.id, workspaceId, draftReadyKey, pendingAddition, repeatAddition]);
  async function requestChooserAddition(keys: string[]) {
    if (checkingAddition) return; setCheckingAddition(true);
    try { const fresh = await publishing.refetch(); if (fresh.isError || !fresh.data) throw new Error("Publishing history is unavailable. Try again before adding content."); addChecked(keys, fresh.data, keys.some(key => { const item = library.data?.find(c => `${c.type}:${c.id}` === key); return item?.type === "written" && item.status !== "draft"; })); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Publishing history is unavailable. Try again before adding content."); } finally { setCheckingAddition(false); }
  }
  const available = useMemo(() => [...(library.data ?? []), ...carouselCreations].filter(item => !trashedKeys.has(`${item.type}:${item.id}`)), [library.data, carouselCreations, trashedKeys]);
  const selectedItems = useMemo(() => selected.map(key => available.find(c => `${c.type}:${c.id}` === key)).filter((c): c is Creation => !!c), [selected, available]);
  const canBrowse = mode === "pane" || !!selectionScope;
  const selectedView = canBrowse && paneView === "selection";
  const displayedCreations = mode === "pane" || selectedView ? selectedItems : available;
  const canPrepare = !busy && !publishing.isPending && !publishing.isError && selectedItems.length > 0 &&
    selectedItems.length === selected.length && destinations.length > 0;
  const toggle = (key: string) => { if (selected.includes(key)) setSelected(old => old.filter(x => x !== key)); else void requestChooserAddition([key]); };
  async function planTimes(prefs: SchedulePreferences, posts: { title: string }[], signal: AbortSignal, start: number) {
    const first = new Date(start).toISOString();
    const zone = prefs.timezone;
    const channels = usable.filter(account => destinations.includes(account.id)).map(account => account.platform as "linkedin" | "facebook" | "instagram" | "x");
    if (prefs.excludeWeekends && prefs.startNow && weekdayScheduleSlots([first], zone)[0] !== first) throw new Error("Choose a weekday start date or include weekends to publish immediately.");
    const slots = prefs.cadence === "ai" && posts.length > 1
      ? daytimeScheduleSlots(await suggestCadence({ signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]), data: {
          workspace_id: workspaceId, first_at: first, timezone: zone, titles: posts.map(post => post.title.slice(0, 200)), channels: [...new Set(channels)],
        } }), zone)
      : dailyScheduleSlots(prefs.startNow ? dateKey(new Date(), zone) : prefs.day, prefs.startNow ? "09:00" : prefs.clock, zone, posts.length, prefs.excludeWeekends);
    if (prefs.startNow) slots[0] = first;
    return prefs.excludeWeekends && prefs.cadence === "ai" ? weekdayScheduleSlots(slots, zone) : slots;
  }
  const makePlan = async (publishNow = startNow) => {
    if (preparing.current) return;
    const controller = new AbortController();
    preparing.current = controller;
    setPreparedCount(0);
    setPrepareError("");
    setBusy(true);
    try {
      if (!selectedItems.length || selectedItems.length !== selected.length) throw new Error("Some selected posts are unavailable. Review your selection and try again.");
      if (publishing.isPending || publishing.isError) throw new Error("Publishing history is unavailable. Try again before scheduling.");
      if (selectedItems.some(item => item.type === "carousel") && !usable.some(account => destinations.includes(account.id) && account.platform === "linkedin")) throw new Error("Choose a connected LinkedIn account for your carousel.");
      if (selectedItems.some(item => item.type === "written") && !usable.some(account => destinations.includes(account.id) && account.platform !== "instagram")) throw new Error("Written posts need a Facebook, LinkedIn or X account. Instagram requires an image or video.");
      const start = publishNow ? Date.now() + 5 * 60_000 : Date.parse(workspaceInstant(day, clock, timezone));
      if (!publishNow && (!Number.isFinite(start) || start < Date.now() + 60_000)) throw new Error("Choose a posting time at least one minute ahead.");
      const preferences = { cadence, excludeWeekends, timezone, day, clock, startNow: publishNow };
      const slots = await planTimes(preferences, selectedItems, controller.signal, start);
      controller.signal.throwIfAborted();
      const previous = previousReview.current;
      if (previous && previous.items.length === selected.length &&
          previous.items.every(item => selected.includes(`${item.type}:${item.id}`)) &&
          previous.destinations.length === destinations.length && destinations.every(id => previous.destinations.includes(id))) {
        const proposed = previous.items.map((item, index) => ({ ...item, scheduled_at: slots[index]! }));
        setItems(await fitPlan(proposed, preferences));
        setStartNow(publishNow);
        setAssumptions("Review each caption, destination and time before confirming.");
        setRequestId(crypto.randomUUID());
        return;
      }
      const plan: PlanItem[] = [];
      let notes = "";
      const batchSize = 3;
      const prepareBatch = async (offset: number) => {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
        const creations = selectedItems.slice(offset, offset + batchSize).map(({ type, id }) => ({ type, id }));
        const result = await prepare({ signal, data: { workspace_id: workspaceId, creations, account_ids: destinations,
          first_at: new Date(start + offset * 86400000).toISOString(), timezone } });
        signal.throwIfAborted();
        setPreparedCount(count => count + result.items.length);
        notes = result.assumptions;
        return result.items.map((item, index) => ({ ...item, scheduled_at: slots[offset + index]!, account_ids: destinations.filter(id => Object.hasOwn(item.captions, accounts.find(account => account.id === id)?.platform ?? "") && !(publishing.data?.[item.id] ?? []).some(status => status.accountId === id && status.status !== "failed")), repeat_accounts: [] }));
      };
      for (let offset = 0; offset < selectedItems.length; offset += batchSize * 2) {
        const pair = [prepareBatch(offset)];
        if (offset + batchSize < selectedItems.length) pair.push(prepareBatch(offset + batchSize));
        for (const batch of await Promise.all(pair)) plan.push(...batch);
      }
      const fitted = await fitPlan(plan, preferences);
      controller.signal.throwIfAborted();
      setItems(fitted);
      setStartNow(publishNow);
      setAssumptions(fitted.some((item, index) => item.scheduled_at !== plan[index]!.scheduled_at) ? "Some times were adjusted around existing bookings. Review each date and destination before confirming." : cadence === "ai" ? "Sam suggested these dates and times. Review them before confirming." : notes);
      setRequestId(crypto.randomUUID());
    } catch (error) {
      if (!controller.signal.aborted) setPrepareError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Preparation timed out. Your selection is saved. Try preparing it again.");
    } finally {
      controller.abort();
      preparing.current = null;
      setBusy(false);
    }
  };
  // Campaign dates arrive prefilled, so fit them once before presenting them for review.
  useEffect(() => {
    if (!open || !items?.length || !initialCampaignFit.current || busy || uncertain) return;
    initialCampaignFit.current = false;
    let active = true;
    setBusy(true);
    void fitPlan(items, { cadence, excludeWeekends, timezone, day, clock, startNow }).then(fitted => {
      if (!active) return;
      setItems(fitted);
      if (fitted.some((item, index) => item.scheduled_at !== items[index]!.scheduled_at)) setAssumptions("Some campaign times were adjusted around existing bookings. Review each date and destination before confirming.");
    }).catch(error => { if (active) toast.error(error instanceof Error ? error.message : "Could not check existing bookings. Review and retry."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; setBusy(false); };
  }, [open, items]);
  const bookingCheck = useQuery({
    queryKey: ["schedule-booking-check", workspaceId, startNow, items?.map(item => item.scheduled_at)],
    enabled: open && !!items?.length && !uncertain,
    queryFn: () => reviewedBookings(items!, startNow),
    staleTime: 0,
  });
  const conflict = items ? hasConflict(items, bookingCheck.data ?? [], startNow) : false;
  const firstConflict = items?.length ? hasConflict(items.slice(0, 1), bookingCheck.data ?? [], startNow) : false;
  const inspectStatus = async () => {
    const request = pendingRequest.current;
    if (!request || !items) return;
    setBusy(true);
    try {
      const status = await checkStatus({ data: request });
      setReport({ uncertain: true, resolved: status.every(row => row.accepted), rows: status.map(row => ({ outcome: row.accepted ? "Accepted" : "Awaiting confirmation", title: items.find(item => item.type === row.type && item.id === row.id)?.title ?? "Post", detail: row.accepted ? row.channels.length ? row.channels.map(channel => `${channel.platform}: ${channel.status}${channel.error ? ` (${channel.error})` : ""}`).join(" · ") : "Accepted; channel status unavailable" : "Not yet confirmed — the request may still be processing" })) });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not check schedule status"); } finally { setBusy(false); }
  };
  function refreshDraftTimes() {
    if (!open || !items || busy || uncertain || pendingRequest.current || report || draftReadyKey !== `${user?.id}:${draftScope}`) return false;
    const updated = refreshExpiredSlots(items, timezone, cadence === "daily", excludeWeekends, startNow, Date.now());
    if (updated === items) return false;
    setItems(updated);
    toast.info("An earlier posting time expired. Review the updated draft times before confirming.");
    return true;
  }
  useEffect(() => {
    if (!open || !items?.length || busy || uncertain || pendingRequest.current || report || draftReadyKey !== `${user?.id}:${draftScope}`) return;
    if (refreshDraftTimes()) return;
    const timer = window.setInterval(refreshDraftTimes, 15_000);
    window.addEventListener("focus", refreshDraftTimes);
    document.addEventListener("visibilitychange", refreshDraftTimes);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDraftTimes);
      document.removeEventListener("visibilitychange", refreshDraftTimes);
    };
  }, [open, items, busy, uncertain, report, draftReadyKey, draftScope, user?.id, timezone, cadence, excludeWeekends, startNow]);
  const confirm = async (firstOnly = false) => {
    if (!items?.length || confirming.current || refreshDraftTimes()) return;
    const selectedPlan = firstOnly ? items.slice(0, 1) : items;
    if (!pendingRequest.current && selectedPlan.some(i => trashedKeys.has(`${i.type}:${i.id}`) || (i.type === "tile" && !trash.isSuccess) || (i.type === "written" && !writtenTrash.isSuccess) || (i.type === "carousel" && !carouselTrash.isSuccess))) { toast.error("Check Trash before confirming this schedule."); return; }
    confirming.current = true;
    setBusy(true);
    if (!pendingRequest.current) {
      try {
        const fresh = await reviewedBookings(selectedPlan, startNow);
        if (hasConflict(selectedPlan, fresh, startNow)) throw new Error("A selected account already has a post at this minute. Choose another time.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not check existing bookings. Try again before scheduling.");
        confirming.current = false;
        setBusy(false);
        return;
      }
    }
    setUncertain(true); try {
    const request = pendingRequest.current ?? { workspace_id: workspaceId, items: (firstOnly ? items.slice(0, 1) : items).map(({ type, id, revision, source_caption, scheduled_at, captions, account_ids, repeat_accounts }, index) => ({ type, id, ...(revision ? { revision } : {}), ...(source_caption !== undefined ? { source_caption } : {}), scheduled_at, repeat_accounts, captions: Object.fromEntries(Object.entries(captions).filter(([platform]) => accounts.some(account => account_ids.includes(account.id) && account.platform === platform))), account_ids, immediate: startNow && index === 0 })), account_ids: destinations, request_id: requestId, confirmed: true as const };
    const firstOnlyRequest = request.items.length === 1 && items.length > 1;
    pendingRequest.current = request;
    if (!user?.id || !writeScheduleDraft(user.id, draftScope, { selected, destinations, day, clock, startNow, cadence, timezone, excludeWeekends, items, assumptions, uncertain: true, requestId, pendingRequest: request })) { pendingRequest.current = null; setUncertain(false); throw new Error("Could not safely save this request for retry. Check browser storage and try again."); }
    const result = await schedule({ data: request });
    if (result.confirmation_email === "needs_attention") toast.warning("Your posts were scheduled, but the confirmation email needs attention.");
    const immediate = result.scheduled.filter(s => s.immediate);
    if (immediate.length) {
      const attempts = await Promise.allSettled(immediate.map(s => supabase.functions.invoke("publish-scheduled-posts", { body: { post_id: s.post_id } })));
      if (attempts.some(r => r.status === "rejected" || r.value.error || r.value.data?.failed || r.value.data?.retrying)) toast.warning("Immediate publishing needs attention. Check each channel in Publish.");
      else toast.info("Immediate publishing started. Check each channel in Publish for its status.");
    }
    pendingRequest.current = null;
    setUncertain(false);
    if (user?.id) clearScheduleDraft(user.id, draftScope);
    if (result.scheduled.length) onScheduled();
    const resultRows: ResultRow[] = request.items.map(item => {
      const matches = (row: { type: string; id: string }) => row.type === item.type && row.id === item.id;
      const title = items.find(matches)?.title ?? "Post";
      const failure = result.failures.find(matches);
      const channels = accounts.filter(account => item.account_ids.includes(account.id))
        .map(account => `${account.display_name || account.handle || "Account"} (${account.platform})`).join(", ");
      const timing = item.immediate ? "Immediately after confirmation" : resultTime(item.scheduled_at, timezone);
      const detail = [timing, channels].filter(Boolean).join(" · ");
      if (failure) return { title, outcome: "Not scheduled", detail: failure.error + " · " + detail };
      if (!result.scheduled.some(matches)) return { title, outcome: "Awaiting confirmation", detail };
      return { title, outcome: item.immediate ? "Accepted" : "Scheduled", detail };
    });
    setReport({ rows: resultRows, resolved: !result.failures.length && !firstOnlyRequest, uncertain: false });
    if (result.failures.length || firstOnlyRequest) { setItems(old => old?.filter(item => !result.scheduled.some(s => s.type === item.type && s.id === item.id)) ?? null); setSelected(old => old.filter(key => !result.scheduled.some(s => `${s.type}:${s.id}` === key))); if (immediate.length) setStartNow(false); setRequestId(crypto.randomUUID()); }
    else { setItems(null); setSelected([]); }
  } catch (e) { toast.error(e instanceof Error ? e.message : "Could not schedule posts"); } finally { confirming.current = false; setBusy(false); } };
  const change = (key: string, patch: Partial<PlanItem>) => setItems(old => {
    if (!old) return null;
    const updated = old.map(item => `${item.type}:${item.id}` === key ? { ...item, ...patch } : item);
    const first = startNow ? updated.shift() : undefined;
    updated.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    return first ? [first, ...updated] : updated;
  });
  const openSettings = () => {
    const first = items?.[0]?.scheduled_at;
    setSettingsError("");
    setSettings({ cadence, excludeWeekends, timezone, startNow,
      day: first ? dateKey(first, timezone) : day,
      clock: first && !startNow ? new Date(first).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : clock });
  };
  const applySettings = async () => {
    if (!settings || busy || uncertain || preparing.current || pendingRequest.current) return;
    const controller = new AbortController();
    preparing.current = controller;
    setBusy(true);
    setSettingsError("");
    try {
      const start = settings.startNow ? Date.now() + 300000 : Date.parse(workspaceInstant(settings.day, settings.clock, settings.timezone));
      if (!settings.startNow && start < Date.now() + 60000) throw new Error("Choose a start time at least one minute ahead.");
      if (items) {
        const slots = await planTimes(settings, items, controller.signal, start);
        controller.signal.throwIfAborted();
        const proposed = items.map((item, index) => ({ ...item, scheduled_at: slots[index]! }));
        setItems(await fitPlan(proposed, settings));
        setAssumptions("Review the updated dates and times before confirming.");
        toast.success("Draft posting times updated.");
      }
      setDay(settings.day); setClock(settings.clock); setTimezone(settings.timezone);
      setStartNow(settings.startNow); setCadence(settings.cadence); setExcludeWeekends(settings.excludeWeekends);
      setSettings(null);
    } catch (error) {
      if (!controller.signal.aborted) setSettingsError(error instanceof Error ? error.message : "Could not apply these settings.");
    } finally {
      preparing.current = null;
      setBusy(false);
    }
  };
  const changePostTime = (key: string, instant: string) => {
    if (!items || busy || uncertain || pendingRequest.current) return;
    if (startNow && items[0] && key === `${items[0].type}:${items[0].id}`) {
      setStartNow(false);
      setItems(items.map(item => `${item.type}:${item.id}` === key ? { ...item, scheduled_at: instant } : item)
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at)));
    } else change(key, { scheduled_at: instant });
  };
  const move = (from: number, to: number) => setItems(old => {
    if (!old || to < 0 || to >= old.length || from === to) return old;
    const slots = old.map(item => item.scheduled_at);
    const reordered = [...old];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved!);
    return reordered.map((item, index) => ({ ...item, scheduled_at: slots[index]! }));
  });
  const otherConnected = accounts.filter(account => account.status === "connected" && !usable.includes(account));
  const accountControls = (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Choose accounts</h3>
        {selectedView && (
          <Button type="button" disabled={!canPrepare} onClick={() => void makePlan(true)}>
            {selected.length > 1 ? "Publish first now" : "Publish now"}
          </Button>
        )}
      </div>
      {selected.some(key => key.startsWith("carousel:")) && (
        <p className="text-xs text-muted-foreground">LinkedIn is the publishing destination for carousel PDFs.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {usable.map(account => (
          <label key={account.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <input type="checkbox" checked={destinations.includes(account.id)} onChange={() =>
              setDestinations(current => current.includes(account.id) ? current.filter(id => id !== account.id) : [...current, account.id])
            } />
            <SocialChannelIcon platform={account.platform as SocialPlatform} className="size-4 shrink-0" />
            <span className="sr-only">{account.platform} · </span>{account.display_name || account.handle}
          </label>
        ))}
      </div>
      {!usable.length && <p className="text-sm text-muted-foreground">
        Connect an eligible account to publish. <a href="/app/settings/connections" className="underline">Open Connections</a>
      </p>}
      {otherConnected.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold text-muted-foreground">Other connected accounts</h4>
          <ul className="flex flex-wrap gap-2">
            {otherConnected.map(account => (
              <li key={account.id} className="flex items-start gap-2 rounded-lg border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground">
                {SOCIAL_PLATFORMS.includes(account.platform as SocialPlatform) && (
                  <SocialChannelIcon platform={account.platform as SocialPlatform} className="mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  <span className="block"><span className="capitalize">{account.platform === "youtube" ? "YouTube" : account.platform === "tiktok" ? "TikTok" : account.platform === "linkedin" ? "LinkedIn" : account.platform}</span>
                    {(account.display_name || account.handle) && <> · {account.display_name || account.handle}</>}
                  </span>
                  <span className="block text-xs">{onlyCarousels && account.platform !== "linkedin" ? "Carousel PDFs use LinkedIn" :
                    !account.is_enabled ? "Publishing is paused" :
                    ["facebook", "instagram", "x", "linkedin"].includes(account.platform) ? "Reconnect to publish" : "Unavailable in this scheduler"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
  const creationControls = (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{selectedView || mode === "pane" ? "Selected posts" : "Choose creations"} <span className="font-normal text-muted-foreground">({selected.length}/20)</span></h3>
          <div className="flex gap-2">
            {mode === "dialog" && !selectedView && <Button type="button" size="sm" variant="outline" disabled={checkingAddition || !available.length || selected.length >= 20} onClick={() => void requestChooserAddition(available.map(c => `${c.type}:${c.id}`).filter(key => !selected.includes(key)).slice(0, 20 - selected.length))}>Select all{available.length > 20 ? " (up to 20)" : ""}</Button>}
            <Button type="button" size="sm" variant="ghost" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</Button>
          </div>
        </div>
        {(library.isPending || carousels.isPending) && <p>Loading creations…</p>}{(library.isError || carousels.isError || carouselTrash.isError) && <p role="alert">Could not load all creations.</p>}
        {selectedView && selected.length > selectedItems.length && library.isSuccess && carousels.isSuccess && <p role="alert" className="mt-2 text-sm">Some selected posts are unavailable. Choose the posts again before reviewing.</p>}
        {selectedView && !selected.length && !command && <p className="mt-2 text-sm text-muted-foreground">Choose posts in Browse posts to start a schedule.</p>}
        <div className={selectedView ? "mt-2 max-h-[38dvh] space-y-2 overflow-y-auto pr-1" : "mt-2 grid max-h-[40dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3"}>
          {displayedCreations.map(c => { const key = `${c.type}:${c.id}`; return <div key={key} className={`flex gap-3 rounded-lg border bg-background p-3 text-sm ${selectedView ? "items-start" : "flex-col has-[:checked]:border-foreground"}`}>
            <div className={`flex aspect-square items-center justify-center overflow-hidden rounded bg-muted ${selectedView ? "w-24 shrink-0 sm:w-28" : ""}`}>{c.url ? <button type="button" aria-label={`Preview ${c.title}`} className="h-full w-full" onClick={() => setPreviewTile(c)}><img src={c.url} alt="" className="h-full w-full object-contain" /></button> : c.type === "written" ? <span className="line-clamp-4 whitespace-pre-wrap px-3 text-left text-xs">{c.text}</span> : <span className="p-3 text-center text-muted-foreground">{c.type === "video" && c.renderId ? <button type="button" className="font-semibold underline" onClick={() => setPreviewTile(c)}>Preview video</button> : "Image unavailable"}</span>}</div>
            <div className="min-w-0 space-y-2"><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1" disabled={checkingAddition} checked={selected.includes(key)} onChange={() => toggle(key)} /><span className="min-w-0 break-words"><span className="line-clamp-2">{c.title}</span><span className="block text-xs text-muted-foreground">{c.type === "tile" ? "Social tile" : c.type === "video" ? "Video" : c.type === "carousel" ? "LinkedIn carousel" : "Written post"}{c.type === "written" && c.status !== "draft" ? ` · ${c.status === "scheduled" ? "Scheduled" : "Previously published"}` : ""}</span>{(publishing.data?.[c.id] ?? []).map((status, index) => <span key={`${status.accountId}-${index}`} className="mt-1 block text-xs text-muted-foreground">{channelStatusLabel(status)}</span>)}</span></label>
            {c.type === "tile" && <><p className="line-clamp-2 text-xs text-muted-foreground">{c.savedCaption?.caption ?? "No saved caption"}</p><button type="button" className="self-start text-xs font-semibold underline" onClick={() => setPreviewTile(c)}>View caption</button></>}
            </div>
          </div>; })}
        </div>
      </div>
  );
  const selectionControls = (
    <div className="space-y-5">
      {accountControls}
      {creationControls}
      <Button type="button" variant="outline" onClick={openSettings}>Schedule Settings</Button>
    </div>
  );
  const focusedControls = (
    <div className="@container space-y-4">
      <div className="grid items-start gap-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-5">
          {creationControls}
          {accountControls}
        </div>
        <section className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{selected.length > 1 ? "First posting time" : "Posting date and time"}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={openSettings}>Schedule settings</Button>
          </div>
          <ScheduleDateTimePicker day={day} clock={clock} timezone={timezone} onChange={value => { setDay(value.day); setClock(value.clock); setPrepareError(""); }} />
          <Button type="button" variant="outline" className="w-full" disabled={!canPrepare || !day || !clock} onClick={() => void makePlan(false)}>
            {selected.length > 1 ? "Schedule posts" : "Schedule post"}
          </Button>
        </section>
      </div>
    </div>
  );
  const scheduleStage = report?.rows.length && report.rows.every(row => row.outcome === "Scheduled") ? "scheduled" : "ready";
  const body = <>
    {!selectionScope && <AssetWorkflow standalone stage={scheduleStage} />}
    {mode === "dialog" ? <><DialogTitle className={items || busy ? "sr-only" : undefined}>{busy && !items ? "Preparing your schedule" : "Publish content"}</DialogTitle><DialogDescription className={items || busy ? "sr-only" : undefined}>Select your creations and accounts, then review each proposed post before scheduling. Times are in {timezone}. Your unfinished plan is saved on this device.</DialogDescription></> : <div className="mb-4 flex items-start justify-between gap-3 border-b border-border-control pb-4"><div><h2 className="font-display text-xl font-bold">{selectionScope || selectedView ? "Schedule or publish" : "Schedule"} <span className="text-sm font-normal text-muted-foreground">({selected.length}/20)</span></h2><p className="mt-1 text-xs text-muted-foreground">{selectionScope || selectedView ? "Review the selected posts and destinations before confirming." : "Add content as you browse. Review everything before publishing."}</p></div><div className="flex gap-1"><button type="button" title="Expand schedule" aria-label="Expand schedule" className="rounded-lg p-2 hover:bg-surface-subtle" disabled={busy || uncertain} onClick={() => onModeChange?.("dialog")}><Maximize2 className="size-4" /></button><button type="button" title="Close schedule pane" aria-label="Close schedule pane" disabled={busy || uncertain} className="rounded-lg p-2 hover:bg-surface-subtle disabled:opacity-50" onClick={() => onOpenChange(false)}><X className="size-4" /></button></div></div>}

    {canBrowse && !report && !items && !busy && (
      <div className="mb-3 flex shrink-0 gap-2" role="group" aria-label="Schedule views">
        <Button type="button" size="sm" variant={selectedView ? "default" : "outline"} aria-pressed={selectedView} onClick={() => setPaneView("selection")}>Selected posts</Button>
        <Button type="button" size="sm" variant={selectedView ? "outline" : "default"} aria-pressed={!selectedView} onClick={() => setPaneView("browse")}>Browse posts</Button>
      </div>
    )}
    {(trash.isError || writtenTrash.isError) && <p role="alert">Could not check Trash. <button className="underline" onClick={() => { if (trash.isError) void trash.refetch(); if (writtenTrash.isError) void writtenTrash.refetch(); }}>Retry</button></p>}
    {report ? <div className="flex min-h-0 flex-1 flex-col gap-4"><div><h2 className="text-2xl font-semibold">Schedule results</h2><p className="text-sm text-muted-foreground">{report.uncertain ? "Live status from the recorded request. Unconfirmed posts may still be processing." : [`${report.rows.filter(row => row.outcome === "Scheduled" || row.outcome === "Accepted").length} accepted`, `${report.rows.filter(row => row.outcome === "Not scheduled").length} not scheduled`].join(" · ")}</p></div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{report.rows.map((row, index) => {
        const failed = row.outcome === "Not scheduled";
        const pending = row.outcome === "Awaiting confirmation";
        const Icon = failed ? CircleX : pending ? Clock3 : CircleCheck;
        return <div key={index} className="flex gap-3 rounded-lg border p-3">
          <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${failed ? "text-destructive" : pending ? "text-muted-foreground" : "text-success"}`} />
          <div><p className="text-xs font-semibold">{row.outcome}</p><p className="font-medium">{row.title}</p><p className="text-sm text-muted-foreground">{row.detail}</p></div>
        </div>;
      })}</div><div className="flex justify-end gap-2 border-t pt-4">{report.uncertain && !report.resolved && <Button variant="outline" disabled={busy} onClick={() => void inspectStatus()}>Check again</Button>}<Button onClick={() => { if (report.uncertain && report.resolved) { const accepted = pendingRequest.current?.items ?? []; const remaining = items?.filter(item => !accepted.some(row => row.type === item.type && row.id === item.id)) ?? []; pendingRequest.current = null; setUncertain(false); if (user?.id) clearScheduleDraft(user.id, draftScope); onScheduled(); setReport(null); if (remaining.length) { setItems(remaining); setSelected(remaining.map(item => `${item.type}:${item.id}`)); setStartNow(false); setRequestId(crypto.randomUUID()); } else onOpenChange(false); } else if (report.resolved) { setReport(null); onOpenChange(false); } else setReport(null); }}>{report.resolved ? "Done" : report.rows.some(row => row.outcome === "Not scheduled") ? "Review failed posts to retry" : "Back to plan"}</Button></div></div> : busy && !items ? <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-10 text-center sm:py-14">
      <div className="relative mb-7 flex h-24 w-24 items-center justify-center"><span className="absolute inset-0 rounded-full border-2 border-muted" /><span className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground motion-safe:animate-spin" /><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"><Sparkles className="h-7 w-7 motion-safe:animate-pulse" aria-hidden="true" /></span></div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Preparing your schedule</h2>
      <p className="mt-3 text-sm">{preparedCount} of {selectedItems.length} posts prepared for review</p>
      <progress aria-label="Posts prepared" className="mt-4 h-2 w-full accent-foreground" value={preparedCount} max={selectedItems.length || 1} />
      <p className="mt-3 text-sm text-muted-foreground">Checking captions for {usable.filter(a => destinations.includes(a.id)).map(a => a.platform).join(", ")}.</p>
      <Button variant="outline" className="mt-4" onClick={() => preparing.current?.abort()}>Back to selection</Button>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Nothing will be published until you confirm.</p>
    </div> : !items ? <>
      {prepareError && <p role="alert" className="mb-3 rounded-lg border p-3 text-sm">{prepareError}</p>}
      {selectedView ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{focusedControls}</div>
      ) : !canBrowse ? selectionControls : <>
          {trash.isSuccess && writtenTrash.isSuccess && carouselTrash.isSuccess && <ScheduleAssetGallery trashedKeys={trashedKeys} workspaceId={workspaceId} selected={selected} />}
          {!selectionScope && selected.length > 0 && <details className="max-h-[44dvh] shrink-0 overflow-y-auto border-t py-2">
            <summary className="cursor-pointer py-2 text-sm font-semibold">Manage selection ({selected.length}/20)</summary>
            {selectionControls}
          </details>}
      </>}
      {!selectedView && !selectionScope && (mode === "dialog" || selected.length > 0) && <div className={mode === "pane" ? "shrink-0 border-t border-border-control bg-background pt-4" : "mt-4"}><Button className="min-h-12 w-full" disabled={busy || !selectedItems.length || selectedItems.length !== selected.length || !destinations.length || !day || !clock} onClick={() => void makePlan()}>{busy ? "Preparing…" : "Prepare schedule"}</Button></div>}
    </> : <>{campaignRows?.some(row => !usable.some(account => account.platform === row.platform)) && <p role="alert">A planned channel needs a connected publishing account. <a className="underline" href="/app/settings/connections">Open Connections</a></p>}<ScheduleReview onOpenSettings={openSettings} onChangePostTime={changePostTime} compact={mode === "pane"} items={items} accounts={usable.filter(a => destinations.includes(a.id))} timezone={timezone} startNow={startNow} busy={busy} uncertain={uncertain} assumptions={assumptions} bookingMessage={conflict ? "A selected account already has a post at this minute. Choose another time." : bookingCheck.isError ? "Could not check existing bookings. Retry by changing a date or reopening the schedule." : bookingCheck.isPending ? "Checking existing bookings…" : ""} bookingBlocked={!uncertain && (bookingCheck.isPending || bookingCheck.isError || conflict)} firstBookingBlocked={!uncertain && (bookingCheck.isPending || bookingCheck.isError || firstConflict)} publishingStatus={publishing.data ?? {}} imageFor={item => available.find(c => c.type === item.type && c.id === item.id)?.url} onChange={change} onMove={move} onRemove={key => { setItems(old => old?.filter(item => `${item.type}:${item.id}` !== key) ?? null); setSelected(old => old.filter(item => item !== key)); }} onBack={() => {
        if (campaignRows) { onOpenChange(false); return; }
        previousReview.current = { items, destinations };
        setItems(null);
      }} onCheckStatus={() => void inspectStatus()} onConfirm={mode => void confirm(mode === "first")} /></>}

  </>;
  return <>
    {mode === "dialog" ? <Dialog open={open} onOpenChange={value => { if (!busy && !uncertain) onOpenChange(value); }}><DialogContent className={items ? "flex h-[94dvh] w-[96vw] flex-col gap-0 overflow-hidden p-4 sm:max-w-[1500px] sm:p-6" : "max-h-[90dvh] max-w-4xl overflow-y-auto"}>{onModeChange && <button type="button" aria-label="Show schedule pane" title="Show schedule pane" className="absolute right-12 top-4 rounded-lg p-2 hover:bg-surface-subtle" disabled={busy || uncertain} onClick={() => onModeChange("pane")}><PanelRightClose className="size-4" /></button>}{body}</DialogContent></Dialog> : <aside aria-label="Schedule pane" className={`fixed bottom-3 right-3 top-16 z-40 flex w-[min(1100px,calc(100vw-1.5rem))] flex-col rounded-2xl border border-border-control bg-background p-5 text-ink shadow-xl ${!items && !report && !busy ? "overflow-hidden" : "overflow-y-auto"}`}>{body}</aside>}
    <AlertDialog open={!!repeatAddition} onOpenChange={value => { if (!value) setRepeatAddition(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Add previously published or scheduled content?</AlertDialogTitle><AlertDialogDescription>At least one selected item has already been published or scheduled. You can review its channel history and confirm any repeat posting in the schedule before publishing.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const keys = repeatAddition; setRepeatAddition(null); if (!keys) return; if (items) setPendingAddition(keys); else setSelected(current => [...current, ...keys.filter(key => !current.includes(key))]); }}>Add to schedule</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {previewTile?.type === "tile" && <ScheduleTilePreview workspaceId={workspaceId} tile={previewTile} publishingHistory={publishing.isSuccess ? publishing.data[previewTile.id] ?? [] : undefined} onClose={() => setPreviewTile(null)} />}
    {previewTile?.type === "carousel" && <ScheduleCarouselPreviewDialog workspaceId={workspaceId} carouselId={previewTile.id} title={previewTile.title} onClose={() => setPreviewTile(null)} />}
    {previewTile?.type === "video" && <Dialog open onOpenChange={open => { if (!open) setPreviewTile(null); }}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogTitle className="pr-6">{previewTile.title}</DialogTitle>
        <DialogDescription className="sr-only">Finished video preview.</DialogDescription>
        <VideoReview asset={previewTile} onReady={() => {}} />
      </DialogContent>
    </Dialog>}
    {settings && <Dialog open onOpenChange={value => { if (!value && !busy) setSettings(null); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogTitle>Schedule Settings</DialogTitle>
        <DialogDescription>Choose the timing for this draft. You can review every date before confirming.</DialogDescription>
        <fieldset disabled={busy} className="grid gap-4">
          <fieldset className="space-y-2"><legend className="font-semibold">Posting frequency</legend>
            {(["daily", "ai"] as const).map(option => <label key={option} className="flex items-center gap-2"><input type="radio" name="cadence" checked={settings.cadence === option} onChange={() => setSettings({ ...settings, cadence: option })} />{option === "daily" ? "One per day" : "Let AI decide"}</label>)}
          </fieldset>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.excludeWeekends} onChange={e => setSettings({ ...settings, excludeWeekends: e.target.checked })} />Exclude weekends</label>
          <label className="grid gap-1 text-sm font-medium">Timezone<select className="rounded-md border bg-background p-2" value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })}>
            {[...new Set([workspaceZone, timezone, "UTC", "Europe/London", ...(Intl.supportedValuesOf?.("timeZone") ?? ["America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Australia/Sydney"])])].map(zone => <option key={zone} value={zone}>{zone === "Europe/London" ? "UK time (London)" : zone.replaceAll("_", " ")}</option>)}
          </select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.startNow} onChange={e => setSettings({ ...settings, startNow: e.target.checked })} />Start immediately after confirmation</label>
          {!settings.startNow && <ScheduleDateTimePicker day={settings.day} clock={settings.clock} timezone={settings.timezone} onChange={value => setSettings({ ...settings, ...value })} />}
          {settingsError && <p role="alert" className="text-sm text-destructive">{settingsError}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSettings(null)}>Cancel</Button><Button onClick={() => void applySettings()}>{busy ? "Applying…" : "Apply settings"}</Button></div>
        </fieldset>
      </DialogContent>
    </Dialog>}
    <AlertDialog open={!!pendingAddition} onOpenChange={value => { if (!value) setPendingAddition(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Add to this schedule?</AlertDialogTitle><AlertDialogDescription>Adding content will clear the prepared schedule and its edited captions and times. Your selected items and account choices will stay. Prepare the schedule again after adding.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep current plan</AlertDialogCancel><AlertDialogAction onClick={() => { if (!pendingAddition) return; setSelected(current => [...current, ...pendingAddition]); setItems(null); setRequestId(crypto.randomUUID()); setPendingAddition(null); }}>Add and prepare again</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}


