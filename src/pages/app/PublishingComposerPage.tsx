import { useEffect, useMemo, useRef, useState } from "react";
import { composeCaption } from "@/lib/compose-caption.functions";
import { suggestBestTimes } from "@/lib/suggest-best-times.functions";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PublishingNotifications } from "@/components/settings/PublishingNotifications";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarIcon, ImagePlus, Loader2, Sparkles, Facebook, Instagram, Music2, Youtube, X, Linkedin, Send, ShieldCheck, Settings2 } from "lucide-react";
import { ScheduleDateTimePicker } from "@/features/schedule/ScheduleDateTimePicker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { dateKey, nextWorkspaceSlot, workspaceInstant } from "@/features/schedule/planner";

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "x" | "linkedin";

interface SocialAccount {
  id: string;
  platform: Platform;
  external_id: string;
  handle: string | null;
  display_name: string | null;
  status: string;
  expires_at: string | null;
}

type TikTokChoices = { privacy: string | null; allowComments: boolean; allowDuet: boolean; allowStitch: boolean; commercialDisclosure: boolean; promotesOwnBrand: boolean; brandedContent: boolean; durationSeconds: number | null; consent: boolean };
type TikTokCreator = { creator_nickname: string; privacy_level_options: string[]; comment_disabled: boolean; duet_disabled: boolean; stitch_disabled: boolean; max_video_post_duration_sec: number };
const emptyTikTokChoices = (): TikTokChoices => ({ privacy: null, allowComments: false, allowDuet: false, allowStitch: false, commercialDisclosure: false, promotesOwnBrand: false, brandedContent: false, durationSeconds: null, consent: false });
const tiktokPrivacy: Record<string, string> = { PUBLIC_TO_EVERYONE: "Everyone", MUTUAL_FOLLOW_FRIENDS: "Friends", FOLLOWER_OF_CREATOR: "Followers", SELF_ONLY: "Only me" };

interface MediaItem {
  id: string;
  kind: "image" | "video" | "document";
  storage_path: string;
  signed_url?: string | undefined;
  position: number;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  mime?: string | null;
}

async function inspectUpload(file: File): Promise<{ width: number | null; height: number | null; duration_ms: number | null }> {
  if (file.type.startsWith("image/")) {
    const image = await createImageBitmap(file);
    const result = { width: image.width, height: image.height, duration_ms: null };
    image.close();
    return result;
  }
  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration_ms: Math.round(video.duration * 1000) });
        video.onerror = () => reject(new Error("Could not read video dimensions and duration"));
        video.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  throw new Error("Choose an image or video file");
}

const PLATFORM_META: Record<Platform, { label: string; icon: typeof Facebook; max: number }> = {
  facebook: { label: "Facebook", icon: Facebook, max: 63206 },
  instagram: { label: "Instagram", icon: Instagram, max: 2200 },
  tiktok: { label: "TikTok", icon: Music2, max: 2200 },
  x: { label: "X", icon: X, max: 280 },
  youtube: { label: "YouTube", icon: Youtube, max: 5000 },
  linkedin: { label: "LinkedIn", icon: Linkedin, max: 3000 },
};

interface ComposerProps {
  embedded?: boolean;
  postIdProp?: string | null;
  initialScheduledAt?: Date | null;
  onClose?: () => void;
  onPostIdChange?: (id: string) => void;
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export default function PublishingComposerPage({ embedded = false, postIdProp = null, initialScheduledAt = null, onClose, onPostIdChange, flushRef }: ComposerProps = {}) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const postIdParam = embedded ? postIdProp : search.get("id");
  const { currentWorkspace } = useWorkspace();

  const closeOrGo = (path: string) => {
    if (embedded && onClose) onClose();
    else navigate(path);
  };

  const [postId, setPostId] = useState<string | null>(postIdParam);
  const [caption, setCaption] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const workspaceZone = currentWorkspace?.timezone;
  const wsTz = workspaceZone === "UTC" && browserTz === "Europe/London" ? browserTz : workspaceZone || browserTz || "UTC";
  const workspaceClock = (instant: Date) => new Intl.DateTimeFormat("en-GB", {
    timeZone: wsTz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(instant);
  const setWorkspaceSlot = (day: string, clock: string) => {
    try { setScheduledAt(new Date(workspaceInstant(day, clock, wsTz))); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Choose another time"); }
  };
  const [publishingNow, setPublishingNow] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [slotEdit, setSlotEdit] = useState<{day: string; clock: string} | null>(null);
  const [originalTargets, setOriginalTargets] = useState<string[]>([]);
  const [postStatus, setPostStatus] = useState<string>("draft");
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [tiktokChoices, setTikTokChoices] = useState<Record<string, TikTokChoices>>({});
  const [tiktokCreators, setTikTokCreators] = useState<Record<string, TikTokCreator>>({});
  const [tiktokErrors, setTikTokErrors] = useState<Record<string, string>>({});
  const [tiktokRetry, setTikTokRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  const initialLoadDone = useRef(false);
  const publishingConfirmed = useRef(false);
  const saveDraftRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Advanced post-format options
  const [postType, setPostType] = useState<"feed" | "reel" | "story" | "photo" | "carousel">("feed");
  const [privacyLevel, setPrivacyLevel] = useState<"public" | "friends" | "followers" | "self">("public");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [youtubeVisibility, setYoutubeVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [duetDisabled, setDuetDisabled] = useState(false);
  const [stitchDisabled, setStitchDisabled] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [aiDisclosure, setAiDisclosure] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Per-target caption overrides (keyed by social_account_id)
  const [targetOverrides, setTargetOverrides] = useState<Record<string, { caption?: string; first_comment?: string }>>({});
  // Best-time recommendations
  const [bestTimes, setBestTimes] = useState<{ platform: string; day_of_week: number; hour: number; score: number }[]>([]);
  const [loadingBestTimes, setLoadingBestTimes] = useState(false);
  const [nextSlot, setNextSlot] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const defaults = Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, hour: 9 }));
    setNextSlot(nextWorkspaceSlot(wsTz, bestTimes.length ? bestTimes : defaults));
  }, [wsTz, bestTimes]);

  // Load accounts + (optionally) existing post
  useEffect(() => {
    const load = async () => {
      if (!currentWorkspace?.id) return;
      setLoading(true);
      // TikTok remains unavailable here until its per-account choices and
      // consent are persisted and enforced by the publishing worker.
      const { data: accs } = await supabase
        .from("social_accounts")
        .select("id, platform, external_id, handle, display_name, status, expires_at")
        .eq("workspace_id", currentWorkspace.id)
        .eq("is_enabled", true)
        .in("platform", ["facebook", "instagram", "youtube", "x", "linkedin"])
        .in("status", ["active", "connected"]);
      setAccounts((accs ?? []) as SocialAccount[]);

      // Check workspace approval policy
      const { data: ws } = await supabase
        .from("workspaces").select("requires_approval").eq("id", currentWorkspace.id).maybeSingle();
      setRequiresApproval(!!ws?.requires_approval);

      if (postIdParam) {
        const { data: post } = await supabase
          .from("posts")
          .select(
            "caption, first_comment, scheduled_at, status, post_type, privacy_level, comments_disabled, duet_disabled, stitch_disabled, branded_content, ai_disclosure, location_id, youtube_title, youtube_description, youtube_visibility, youtube_made_for_kids",
          )
          .eq("id", postIdParam)
          .maybeSingle();
        if (post) {
          setCaption(post.caption ?? "");
          setFirstComment(post.first_comment ?? "");
          setScheduledAt(post.scheduled_at ? new Date(post.scheduled_at) : null);
          setPostStatus(post.status ?? "draft");
          setPostType(((post as any).post_type as any) ?? "feed");
          setPrivacyLevel(((post as any).privacy_level as any) ?? "public");
          setYoutubeTitle((post as any).youtube_title ?? "");
          setYoutubeDescription((post as any).youtube_description ?? "");
          setYoutubeVisibility((post as any).youtube_visibility ?? "public");
          setYoutubeMadeForKids((post as any).youtube_made_for_kids ?? false);
          setCommentsDisabled(!!(post as any).comments_disabled);
          setDuetDisabled(!!(post as any).duet_disabled);
          setStitchDisabled(!!(post as any).stitch_disabled);
          setBrandedContent(!!(post as any).branded_content);
          setAiDisclosure(!!(post as any).ai_disclosure);
          setLocationId((post as any).location_id ?? "");
        }
        const { data: targets } = await supabase
          .from("post_targets")
          .select("social_account_id, caption_override, first_comment_override, tiktok_options" as "social_account_id, caption_override, first_comment_override")
          .eq("post_id", postIdParam);
        const targetIds = (targets ?? []).map(t => t.social_account_id);
        setOriginalTargets(targetIds);
        setSelectedAccounts(new Set(targetIds));
        const overrides: Record<string, { caption?: string; first_comment?: string }> = {};
        (targets ?? []).forEach((t: any) => {
          if (t.caption_override || t.first_comment_override) {
            overrides[t.social_account_id] = {
              caption: t.caption_override ?? undefined,
              first_comment: t.first_comment_override ?? undefined,
            };
          }
        });
        setTargetOverrides(overrides);
        const choices: Record<string, TikTokChoices> = {};
        (targets ?? []).forEach((t: any) => { if (t.tiktok_options) choices[t.social_account_id] = { ...emptyTikTokChoices(), ...t.tiktok_options, consent: false }; });
        setTikTokChoices(choices);
        const { data: mediaRows } = await supabase
          .from("post_media")
          .select("id, kind, storage_path, position, alt_text, width, height, duration_ms, mime")
          .eq("post_id", postIdParam)
          .order("position");
        const items = await hydrateSignedUrls((mediaRows ?? []) as MediaItem[]);
        setMedia(items);
      } else {
        setCaption("");
        setFirstComment("");
        setScheduledAt(initialScheduledAt);
        setPostStatus("draft");
        setPostType("feed");
        setPrivacyLevel("public");
        setCommentsDisabled(false);
        setDuetDisabled(false);
        setStitchDisabled(false);
        setBrandedContent(false);
        setAiDisclosure(false);
        setLocationId("");
        setSelectedAccounts(new Set());
        setTargetOverrides({});
        setTikTokChoices({});
        setMedia([]);
      }
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id, postIdParam]);

  const hydrateSignedUrls = async (items: MediaItem[]): Promise<MediaItem[]> => {
    return Promise.all(
      items.map(async (m) => {
        const { data } = await supabase.storage.from("post-media").createSignedUrl(m.storage_path, 3600);
        return { ...m, signed_url: data?.signedUrl };
      }),
    );
  };

  const ensurePost = async (): Promise<string> => {
    if (postId) return postId;
    if (!currentWorkspace?.id) throw new Error("No workspace");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const { data, error } = await supabase
      .from("posts")
      .insert({ workspace_id: currentWorkspace.id, created_by: u.user.id, caption, first_comment: firstComment })
      .select("id")
      .single();
    if (error) throw error;
    setPostId(data.id);
    onPostIdChange?.(data.id);
    if (!embedded) {
      window.history.replaceState(null, "", `/app/publishing/composer?id=${data.id}`);
    }
    return data.id;
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !currentWorkspace?.id) return;
    setUploading(true);
    try {
      const inspected = await Promise.all(Array.from(files).map(async (file) => ({ file, properties: await inspectUpload(file) })));
      const id = await ensurePost();
      const newItems: MediaItem[] = [];
      for (const [i, { file, properties }] of inspected.entries()) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${currentWorkspace.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("post-media").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const kind: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
        const { data: row, error: insErr } = await supabase
          .from("post_media")
          .insert({ post_id: id, kind, storage_path: path, mime: file.type, position: media.length + i, ...properties })
          .select("id, kind, storage_path, position, width, height, duration_ms, mime")
          .single();
        if (insErr) throw insErr;
        newItems.push(row as MediaItem);
      }
      const hydrated = await hydrateSignedUrls(newItems);
      setMedia((m) => [...m, ...hydrated]);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeMedia = async (item: MediaItem) => {
    await supabase.storage.from("post-media").remove([item.storage_path]);
    await supabase.from("post_media").delete().eq("id", item.id);
    setMedia((m) => m.filter((x) => x.id !== item.id));
  };

  const updateAltText = async (mediaId: string, alt: string) => {
    setMedia((m) => m.map((x) => (x.id === mediaId ? { ...x, alt_text: alt } : x)));
    await supabase.from("post_media").update({ alt_text: alt || null }).eq("id", mediaId);
  };

  const fetchBestTimes = async () => {
    if (!currentWorkspace?.id) return;
    setLoadingBestTimes(true);
    try {
      const platforms = [...new Set(
        [...selectedAccounts]
          .map((id) => accounts.find((a) => a.id === id)?.platform)
          .filter(Boolean) as Platform[],
      )];
      const data = await suggestBestTimes({
        data: { workspace_id: currentWorkspace.id, ...(platforms.length ? { platforms } : {}) },
      });
      setBestTimes(data.slots);
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't load best times");
    } finally {
      setLoadingBestTimes(false);
    }
  };

  const applyBestTime = (slot: { day_of_week: number; hour: number }) => {
    const today = new Date(`${dateKey(new Date(), wsTz)}T12:00:00Z`);
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(today);
      candidate.setUTCDate(today.getUTCDate() + offset);
      if (candidate.getUTCDay() !== slot.day_of_week) continue;
      try {
        const result = new Date(workspaceInstant(candidate.toISOString().slice(0, 10), `${String(slot.hour).padStart(2, "0")}:00`, wsTz));
        if (result.getTime() <= Date.now() + 60_000) continue;
        setScheduledAt(result);
        toast.success(`Slot set: ${result.toLocaleString("en-GB", { timeZone: wsTz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${wsTz})`);
        return;
      } catch { /* This local hour may be skipped by daylight saving. */ }
    }
    toast.error("No valid upcoming slot; choose another time");
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveDraft = async (silent = false, existingId?: string) => {
    if (silent && (!dirty || publishingConfirmed.current)) return;
    if (!postId && !caption.trim() && selectedAccounts.size === 0 && media.length === 0) return;
    setSaving(true);
    const savingVersion = editVersion.current;
    try {
      const id = existingId ?? await ensurePost();
      const { error: updateError } = await supabase
        .from("posts")
        .update({
          caption,
          first_comment: firstComment,
          ...(postStatus === "draft" ? { scheduled_at: scheduledAt?.toISOString() ?? null } : {}),
          post_type: postType,
          privacy_level: privacyLevel,
          youtube_title: youtubeTitle,
          youtube_description: youtubeDescription,
          youtube_visibility: youtubeVisibility,
          youtube_made_for_kids: youtubeMadeForKids,
          comments_disabled: commentsDisabled,
          duet_disabled: duetDisabled,
          stitch_disabled: stitchDisabled,
          branded_content: brandedContent,
          ai_disclosure: aiDisclosure,
          location_id: locationId || null,
        })
        .eq("id", id);
      if (updateError) throw updateError;
      // Reconcile targets
      const { data: existing } = await supabase.from("post_targets").select("id, social_account_id").eq("post_id", id);
      const existingMap = new Map((existing ?? []).map((t) => [t.social_account_id, t.id]));
      const toAdd = [...selectedAccounts].filter((aid) => !existingMap.has(aid));
      const toRemove = [...existingMap.entries()].filter(([aid]) => !selectedAccounts.has(aid)).map(([, tid]) => tid);
      if (toAdd.length) {
        const rows = toAdd.map((aid) => {
          const acc = accounts.find((a) => a.id === aid)!;
          return { post_id: id, social_account_id: aid, platform: acc.platform };
        });
        const { error: addError } = await supabase.from("post_targets").insert(rows);
        if (addError) throw addError;
      }
      if (toRemove.length) {
        const { error: removeError } = await supabase.from("post_targets").delete().in("id", toRemove);
        if (removeError) throw removeError;
      }

      // Apply per-target overrides
      const { data: refreshed } = await supabase
        .from("post_targets")
        .select("id, social_account_id")
        .eq("post_id", id);
      for (const t of refreshed ?? []) {
        const ov = targetOverrides[t.social_account_id];
        const { error: overrideError } = await supabase
          .from("post_targets")
          .update({
            caption_override: ov?.caption ?? null,
            first_comment_override: ov?.first_comment ?? null,
            ...(accounts.find(a => a.id === t.social_account_id)?.platform === "tiktok" ? { tiktok_options: { ...(tiktokChoices[t.social_account_id] ?? emptyTikTokChoices()), durationSeconds: media.length === 1 && media[0]?.kind === "video" && media[0].duration_ms != null ? media[0].duration_ms / 1000 : null } } : {}),
          } as any)
          .eq("id", t.id);
        if (overrideError) throw overrideError;
      }
      setLastSavedAt(new Date());
      if (savingVersion === editVersion.current) setDirty(false);
      if (!silent) toast.success("Draft saved");
    } catch (e: any) {
      if (!silent) throw e;
      console.warn("Autosave failed", e);
    } finally {
      setSaving(false);
    }
  };
  saveDraftRef.current = saveDraft;

  const validateForDelivery = () => {
    if (selectedAccounts.size === 0) { toast.error("Choose at least one account"); return false; }
    for (const id of selectedAccounts) {
      const account = accounts.find((item) => item.id === id);
      if (!account) { toast.error("Reconnect or remove an unavailable account"); return false; }
      if (media.some(item => item.kind === "document") && account.platform !== "linkedin") { toast.error("Carousel PDFs can only be published to LinkedIn."); return false; }
      if (account.platform === "linkedin" && (!account.expires_at || Date.parse(account.expires_at) <= Date.now())) { toast.error("Reconnect this LinkedIn account before publishing."); return false; }
      if (account.platform === "linkedin" && (targetOverrides[id]?.first_comment ?? firstComment).trim()) { toast.error("LinkedIn first comments are not supported. Remove the first comment before publishing."); return false; }
      const text = targetOverrides[id]?.caption || caption;
      const max = PLATFORM_META[account.platform].max;
      if (text.length > max) { toast.error(`${account.display_name ?? account.platform}: caption exceeds ${max} characters`); return false; }
      if (account.platform === "linkedin" && !text.trim() && !media.length) { toast.error("LinkedIn needs text or media."); return false; }
      if (account.platform === "linkedin" && (media.length > 1 || media.some(item => item.kind === "image" ? !["image/jpeg", "image/png", "image/gif"].includes(item.mime ?? "") : item.kind === "document" ? item.mime !== "application/pdf" : item.mime !== "video/mp4"))) { toast.error("LinkedIn supports one JPEG, PNG, GIF, MP4 or PDF per post."); return false; }
      if (account.platform === "tiktok") {
        const creator = tiktokCreators[id];
        const choices = tiktokChoices[id] ?? emptyTikTokChoices();
        const duration = media.length === 1 && media[0]?.kind === "video" && media[0].duration_ms != null ? media[0].duration_ms / 1000 : null;
        if (!creator) { toast.error("Load current TikTok posting options before publishing."); return false; }
        if (!choices.privacy || !creator.privacy_level_options.includes(choices.privacy)) { toast.error("Choose an available TikTok privacy setting."); return false; }
        if (!duration || !Number.isFinite(duration) || duration > creator.max_video_post_duration_sec) { toast.error("Choose one video within this TikTok account's duration limit."); return false; }
        if ((choices.allowComments && creator.comment_disabled) || (choices.allowDuet && creator.duet_disabled) || (choices.allowStitch && creator.stitch_disabled)) { toast.error("An interaction is disabled for this TikTok account."); return false; }
        if (choices.commercialDisclosure && !choices.promotesOwnBrand && !choices.brandedContent) { toast.error("Choose whose brand the TikTok post promotes."); return false; }
        if (!choices.commercialDisclosure && (choices.promotesOwnBrand || choices.brandedContent)) { toast.error("Enable commercial disclosure before choosing a promotion type."); return false; }
        if (choices.brandedContent && choices.privacy === "SELF_ONLY") { toast.error("Branded content cannot be private."); return false; }
        if (!choices.consent) { toast.error("Confirm the TikTok posting declaration."); return false; }
      }
      if (account.platform === "x") {
        if (!text.trim() && !media.length) { toast.error("X needs text or media."); return false; }
        if (media.length > 4 || (media.some(item => item.kind === "video") && (media.length !== 1 || media[0]?.mime !== "video/mp4")) || media.some(item => item.kind === "image" && item.mime && !["image/jpeg", "image/png", "image/webp"].includes(item.mime))) { toast.error("X supports up to four JPEG, PNG or WebP images, or one MP4 video."); return false; }
      }
      if (account.platform === "instagram") {
        if (!media.length) { toast.error("Instagram needs an image or video. Facebook can publish text alone."); return false; }
        for (const item of media) {
          if (item.kind === "image" && item.mime && item.mime !== "image/jpeg") {
            toast.error("Instagram images must be JPEG. Upload a JPEG version of this asset."); return false;
          }
          if (item.kind === "image" && item.width && item.height && (item.width / item.height < 0.8 || item.width / item.height > 1.91)) {
            toast.error("Instagram images need an aspect ratio between 4:5 and 1.91:1."); return false;
          }
          if (item.kind === "video" && item.duration_ms && (item.duration_ms < 3_000 || item.duration_ms > 900_000)) {
            toast.error("Instagram Reels must be between 3 seconds and 15 minutes."); return false;
          }
        }
      }
      if (account.platform === "youtube") {
        if (!youtubeTitle.trim() || youtubeTitle.trim().length > 100) { toast.error("YouTube title is required and must be 100 characters or fewer."); return false; }
        if (youtubeDescription.length > 5000) { toast.error("YouTube description must be 5,000 characters or fewer."); return false; }
        if (media.length !== 1 || media[0]?.kind !== "video") { toast.error("YouTube publishing needs exactly one reviewed video asset."); return false; }
      }
    }
    return true;
  };

  const schedulePost = async (at = scheduledAt) => {
    if (!at) {
      toast.error("Pick a date and time first");
      return;
    }
    if (at.getTime() < Date.now() + 60_000) {
      toast.error("Pick a time at least 1 minute in the future");
      return;
    }
    if (!validateForDelivery()) return;
    setScheduling(true);
    try {
      await saveDraft();
      const id = await ensurePost();
      const { error } = await supabase
        .from("posts")
        .update({ status: "scheduled", scheduled_at: at.toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(`Scheduled for ${at.toLocaleString("en-GB", { timeZone: wsTz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} (${wsTz})`);
      closeOrGo("/app/schedule");
    } catch (e: any) {
      toast.error(e.message ?? "Could not schedule");
    } finally {
      setScheduling(false);
    }
  };

  const publishNow = async () => {
    if (!validateForDelivery()) return;
    setConfirmPublishOpen(true);
  };

  const fireConfetti = () => {
    const end = Date.now() + 800;
    const colors = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors });
  };

  const doPublishNow = async () => {
    if (publishingConfirmed.current || saving) return;
    publishingConfirmed.current = true;
    setConfirmPublishOpen(false);
    setPublishingNow(true);
    let queued = false;
    try {
      const id = await ensurePost();
      if (dirty || postStatus !== "scheduled") await saveDraft(false, id);
      const { error } = await supabase
        .from("posts")
        .update({ status: "scheduled", scheduled_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", id)
        .in("status", ["draft", "scheduled"])
        .select("id").single();
      if (error) throw error;
      queued = true;
      const { data: result, error: invokeErr } = await supabase.functions.invoke("publish-scheduled-posts", { body: { post_id: id } });
      if (invokeErr) throw invokeErr;
      if (result?.failed || result?.retrying) {
        toast.warning("Some destinations need attention. Check their status in Publish.", { duration: 6000 });
      } else if (result?.succeeded && result?.succeeded === selectedAccounts.size) {
        fireConfetti();
        toast.success(`Published to ${result.succeeded} ${result.succeeded === 1 ? "account" : "accounts"}.`, { duration: 4000 });
      } else {
        toast.info("Publishing is processing. Check each destination in Publish.", { duration: 4000 });
      }
      setTimeout(() => closeOrGo("/app/schedule"), 1200);
    } catch (e: any) {
      if (queued) {
        toast.info("Queued for immediate publishing. Check each account in Publish for its delivery status.");
        closeOrGo("/app/schedule");
      } else {
        publishingConfirmed.current = false;
        toast.error(e.message ?? "Could not publish");
      }
    } finally {
      setPublishingNow(false);
    }
  };

  const submitForApproval = async () => {
    if (selectedAccounts.size === 0) {
      toast.error("Select at least one account first");
      return;
    }
    setSubmitting(true);
    try {
      await saveDraft();
      const id = await ensurePost();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("posts").update({
        status: "awaiting_approval",
        submitted_by: u.user!.id,
        submitted_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      await supabase.from("post_approval_events").insert({
        post_id: id, actor_id: u.user!.id, action: "submitted",
      });
      await supabase.functions.invoke("notify-post-approval", { body: { post_id: id, action: "submitted" } });
      toast.success("Sent for review");
      closeOrGo("/app/schedule");
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't submit");
    } finally {
      setSubmitting(false);
    }
  };

  const generateCaption = async () => {
    setGenerating(true);
    try {
      const platforms = [...selectedAccounts]
        .map((id) => accounts.find((a) => a.id === id)?.platform)
        .filter(Boolean) as Platform[];
      const data = await composeCaption({
        data: { brief: caption, platforms: platforms.length ? platforms : ["instagram"], workspace_id: currentWorkspace?.id },
      });
      if (data.caption) setCaption(data.caption);
      const adapted: Record<string, { caption: string }> = {};
      for (const id of selectedAccounts) {
        const platform = accounts.find((a) => a.id === id)?.platform;
        const version = platform ? data.byPlatform?.[platform] : undefined;
        if (version) adapted[id] = { caption: version };
      }
      if (Object.keys(adapted).length) setTargetOverrides((current) => ({ ...current, ...adapted }));
      toast.success("Sam prepared editable captions for each platform");
    } catch (e: any) {
      toast.error(e.message ?? "Sam couldn't help right now");
    } finally {
      setGenerating(false);
    }
  };

  const selectedPlatforms = useMemo(() => {
    const set = new Set<Platform>();
    selectedAccounts.forEach((id) => {
      const a = accounts.find((x) => x.id === id);
      if (a) set.add(a.platform);
    });
    return [...set];
  }, [selectedAccounts, accounts]);

  const updateTikTok = (id: string, patch: Partial<TikTokChoices>) => setTikTokChoices(current => ({
    ...current, [id]: { ...(current[id] ?? emptyTikTokChoices()), ...patch, ...(Object.keys(patch).some(key => key !== "consent") ? { consent: false } : {}) },
  }));

  useEffect(() => {
    let cancelled = false;
    const ids = [...selectedAccounts].filter(id => accounts.find(a => a.id === id)?.platform === "tiktok");
    setTikTokCreators({});
    setTikTokErrors({});
    for (const id of ids) {
      supabase.functions.invoke("tiktok-creator-info", { body: { account_id: id } }).then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) setTikTokErrors(current => ({ ...current, [id]: "Could not load TikTok posting options. Reconnect or try again." }));
        else {
          const creator = data as TikTokCreator;
          setTikTokCreators(current => ({ ...current, [id]: creator }));
          setTikTokChoices(current => {
            const old = current[id] ?? emptyTikTokChoices();
            return { ...current, [id]: { ...old, allowComments: creator.comment_disabled ? false : old.allowComments, allowDuet: creator.duet_disabled ? false : old.allowDuet, allowStitch: creator.stitch_disabled ? false : old.allowStitch, consent: false } };
          });
        }
      }).catch(() => { if (!cancelled) setTikTokErrors(current => ({ ...current, [id]: "Could not load TikTok posting options. Reconnect or try again." })); });
    }
    return () => { cancelled = true; };
  }, [accounts, selectedAccounts, tiktokRetry]);

  useEffect(() => {
    setTikTokChoices(current => Object.values(current).some(c => c.consent)
      ? Object.fromEntries(Object.entries(current).map(([id, c]) => [id, { ...c, consent: false }])) : current);
  }, [caption, firstComment, targetOverrides, media, scheduledAt, selectedAccounts, postType, aiDisclosure]);

  // Mark dirty whenever any persisted field changes (after initial load).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    editVersion.current += 1;
    setDirty(true);
  }, [
    caption, firstComment, scheduledAt, postType, privacyLevel, youtubeTitle, youtubeDescription, youtubeVisibility, youtubeMadeForKids,
    commentsDisabled, duetDisabled, stitchDisabled, brandedContent,
    aiDisclosure, locationId, selectedAccounts, targetOverrides, tiktokChoices,
  ]);

  // Once the initial load completes, arm the dirty tracker.
  useEffect(() => {
    if (!loading) {
      // Defer one tick so initial state-setters don't trigger dirty.
      const t = setTimeout(() => { initialLoadDone.current = true; }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading]);

  // Debounced autosave when dirty.
  useEffect(() => {
    if (!dirty || loading) return;
    // Don't autosave a brand-new empty post (avoids creating empty drafts on open).
    if (!postId && !caption.trim() && selectedAccounts.size === 0 && media.length === 0) return;
    const t = setTimeout(() => { saveDraftRef.current(true); }, 1200);
    return () => clearTimeout(t);
  }, [dirty, caption, firstComment, scheduledAt, postType, privacyLevel, youtubeTitle, youtubeDescription, youtubeVisibility, youtubeMadeForKids,
      commentsDisabled, duetDisabled, stitchDisabled, brandedContent,
      aiDisclosure, locationId, selectedAccounts, targetOverrides, tiktokChoices, postId, loading, media.length]);

  // Flush any pending changes on unmount (drawer close, navigate away).
  useEffect(() => {
    return () => {
      // Best-effort silent save; ignore errors.
      saveDraftRef.current(true).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose a flush function so the parent can await pending autosaves before closing.
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      try {
        await saveDraftRef.current(true);
      } catch {
        // ignore
      }
    };
    return () => {
      if (flushRef) flushRef.current = null;
    };
  }, [flushRef]);

  const scheduledDrawer = embedded && postStatus === "scheduled";
  const destinations = accounts.filter(a => (!scheduledDrawer || originalTargets.includes(a.id)) && (postType !== "carousel" || a.platform === "linkedin"));
  const previews = destinations.filter(a => selectedAccounts.has(a.id));
  const previewIndex = Math.max(0, previews.findIndex(a => a.id === previewId));
  const active = previews[previewIndex];

  return (
    <div data-scheduled-drawer={scheduledDrawer || undefined} className={embedded ? "px-6 py-6" : "container mx-auto px-6 py-8 max-w-6xl"}>
      {/* Header */}
      <div className={scheduledDrawer ? "sticky top-0 z-10 -mx-6 -mt-6 mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-background px-4 py-3 sm:px-6" : "mb-6 flex flex-wrap items-center gap-3"}>
        {!embedded && (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/publishing")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Posts
            </Button>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}
        <h1 className="text-xl font-semibold">
          {!postId
            ? "New post"
            : postStatus === "published"
            ? "Published post"
            : postStatus === "scheduled"
            ? "Scheduled post"
            : postStatus === "publishing"
            ? "Publishing…"
            : postStatus === "failed"
            ? "Failed post"
            : postStatus === "awaiting_approval"
            ? "Awaiting approval"
            : "Edit draft"}
        </h1>
        {scheduledDrawer && <SheetClose asChild>
          <Button type="button" size="icon" variant="ghost" className="size-11" aria-label="Close scheduled post"><X /></Button>
        </SheetClose>}
        <div className={scheduledDrawer ? "col-span-2 grid grid-cols-2 items-stretch gap-2" : "ml-auto flex max-w-full flex-wrap items-center gap-2"}>
          <Popover open={scheduledDrawer ? Boolean(slotEdit) : undefined} onOpenChange={scheduledDrawer ? open => {
            const instant = scheduledAt ?? new Date();
            setSlotEdit(open ? { day: dateKey(instant, wsTz), clock: workspaceClock(instant) } : null);
          } : undefined}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-auto max-w-full whitespace-normal py-2", scheduledDrawer && "h-full min-h-14 w-full", !scheduledAt && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-2" />
                {scheduledAt ? <span className="text-left">
                  {postStatus === "scheduled" && <span className="block text-xs text-muted-foreground">Scheduled for</span>}
                  {scheduledAt.toLocaleString("en-GB", { timeZone: wsTz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {wsTz === "Europe/London" ? "UK time" : wsTz}
                </span> : "Pick date & time"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={scheduledDrawer ? "w-[min(21rem,calc(100vw-2rem))] space-y-2 p-2" : "w-auto p-0"} align="end">
              {scheduledDrawer ? slotEdit && <>
                <ScheduleDateTimePicker {...slotEdit} timezone={wsTz} onChange={setSlotEdit} />
                <Button className="w-full" disabled={scheduling || saving} onClick={() => {
                  try {
                    void schedulePost(new Date(workspaceInstant(slotEdit.day, slotEdit.clock, wsTz)));
                  } catch {
                    toast.error("Choose a valid local date and time");
                  }
                }}>Apply time</Button>
              </> : <>
              <Calendar
                mode="single"
                selected={scheduledAt ? new Date(`${dateKey(scheduledAt, wsTz)}T12:00:00`) : undefined}
                onSelect={(d) => {
                  if (!d) return setScheduledAt(null);
                  setWorkspaceSlot(format(d, "yyyy-MM-dd"), scheduledAt ? workspaceClock(scheduledAt) : "09:00");
                }}
                disabled={(date) => format(date, "yyyy-MM-dd") < dateKey(new Date(), wsTz)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="p-3 border-t">
                <input
                  type="time"
                  value={scheduledAt ? workspaceClock(scheduledAt) : ""}
                  onChange={(e) => {
                    if (!scheduledAt) return;
                    setWorkspaceSlot(dateKey(scheduledAt, wsTz), e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                />
                {scheduledAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Will publish at <span className="font-medium text-foreground">
                      {scheduledAt.toLocaleString("en-GB", { timeZone: wsTz, hour12: false, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span> ({wsTz})
                    {browserTz !== wsTz && <span className="block mt-1">Browser timezone: {browserTz}</span>}
                  </p>
                )}
              </div>
              <div className="p-3 border-t space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Best times</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={fetchBestTimes} disabled={loadingBestTimes}>
                    {loadingBestTimes ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    {bestTimes.length ? "Refresh" : "Suggest"}
                  </Button>
                </div>
                {bestTimes.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-[260px]">
                    {bestTimes.slice(0, 6).map((s, i) => {
                      const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][s.day_of_week] ?? "";
                      return (
                        <Badge
                          key={i}
                          variant="outline"
                          className="cursor-pointer text-xs"
                          onClick={() => applyBestTime(s)}
                        >
                          {s.platform[0]?.toUpperCase() ?? ""} · {day} {String(s.hour).padStart(2, "0")}:00
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
              </>}
            </PopoverContent>
          </Popover>
          <span className={scheduledDrawer ? "order-last col-span-2 text-xs text-muted-foreground empty:hidden" : "text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1.5 mr-1"} aria-live="polite">
            {saving ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            ) : dirty ? (
              <>Unsaved changes</>
            ) : lastSavedAt ? (
              <>Saved {format(lastSavedAt, "HH:mm")}</>
            ) : null}
          </span>
          {!scheduledDrawer && <Button variant="outline" onClick={() => saveDraft()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save draft
          </Button>}
          {requiresApproval && postStatus !== "scheduled" ? (
            <Button onClick={submitForApproval} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Submit for approval
            </Button>
          ) : (
            <>
              {!scheduledDrawer && scheduledAt ? (
                <Button variant="outline" onClick={() => schedulePost()} disabled={scheduling}>
                  {scheduling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarIcon className="h-4 w-4 mr-2" />}
                  {postStatus === "scheduled" ? "Reschedule" : "Schedule"} to {selectedAccounts.size} {selectedAccounts.size === 1 ? "account" : "accounts"}
                </Button>
              ) : null}
              {!scheduledDrawer && !scheduledAt && nextSlot && <Button variant="outline" onClick={() => schedulePost(new Date(nextSlot))} disabled={scheduling || selectedAccounts.size === 0}>
                <CalendarIcon className="h-4 w-4 mr-2" /> Add to next slot · {new Date(nextSlot).toLocaleString("en-GB", { timeZone: wsTz, weekday: "short", hour: "2-digit", minute: "2-digit" })} · {selectedAccounts.size}
              </Button>}
              <Button className={scheduledDrawer ? "h-full min-h-14 w-full whitespace-normal" : undefined} onClick={publishNow} disabled={loading || saving || publishingNow || selectedAccounts.size === 0}>
                {publishingNow ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Publish now to {selectedAccounts.size}
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className={scheduledDrawer ? "space-y-4" : "grid lg:grid-cols-[1fr_420px] gap-6"}>
          {/* Composer column */}
          <div className="space-y-6">
            {/* Accounts */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">Publish to</CardTitle>
                {!scheduledDrawer && destinations.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedAccounts(new Set(destinations.map((account) => account.id)))}>
                  All connected accounts
                </Button>}
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No connected accounts.{" "}
                    <Link to="/app/settings/connections" className="text-primary underline">
                      Connect one
                    </Link>
                    .
                  </div>
                ) : (
                  <div className={scheduledDrawer ? "flex flex-wrap gap-2" : "grid sm:grid-cols-2 gap-2"}>
                    {destinations.map((a) => {
                      const Meta = PLATFORM_META[a.platform];
                      const Icon = Meta?.icon ?? Facebook;
                      const checked = selectedAccounts.has(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex items-center gap-3 rounded-lg border ${scheduledDrawer ? "px-3 py-1.5" : "p-3"} cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                        >
                          <Checkbox checked={checked} disabled={scheduledDrawer && checked && selectedAccounts.size === 1} onCheckedChange={() => toggleAccount(a.id)} />
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{a.display_name ?? a.handle ?? Meta?.label}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {a.platform === "linkedin"
                                ? a.external_id.startsWith("organization:") ? "LinkedIn Company Page" : "LinkedIn personal profile"
                                : Meta?.label}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Media */}
            {!scheduledDrawer && <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">Media</CardTitle>
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading || postType === "carousel"}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-2" />}
                  Add
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </CardHeader>
              <CardContent>
                {selectedPlatforms.includes("linkedin") && <p className="mb-3 text-xs text-muted-foreground">LinkedIn supports one JPEG, PNG, GIF, MP4 or carousel PDF up to 50 MB per post.</p>}
                {media.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    Drop in images or a video — Sam will tailor previews per platform.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {media.map((m) => (
                      <div key={m.id} className="space-y-2">
                        <div className="relative group aspect-square rounded-md overflow-hidden bg-muted">
                          {m.kind === "video" ? (
                            <video src={m.signed_url} className="w-full h-full object-cover" muted />
                          ) : m.kind === "document" ? (
                            <a href={m.signed_url} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center p-3 text-sm font-semibold underline">Open carousel PDF</a>
                          ) : (
                            <img src={m.signed_url} alt={m.alt_text ?? ""} className="w-full h-full object-cover" />
                          )}
                          {m.kind !== "document" && <button
                            onClick={() => removeMedia(m)}
                            className="absolute top-1 right-1 bg-background/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>}
                        </div>
                        {m.kind === "image" && (
                          <Input
                            value={m.alt_text ?? ""}
                            onChange={(e) => updateAltText(m.id, e.target.value)}
                            placeholder="Alt text (accessibility)"
                            className="h-7 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectedPlatforms.includes("instagram") && media.some((item) => item.kind === "video" && item.width && item.height && item.width > item.height) && (
                  <p className="mt-3 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                    Could perform better: a vertical 9:16 version fills the Instagram Reels screen. <Link to="/app/create" className="underline">Make a vertical version in Create Content</Link>.
                  </p>
                )}
              </CardContent>
            </Card>}

            {[...selectedAccounts].map(id => {
              const account = accounts.find(a => a.id === id && a.platform === "tiktok");
              if (!account) return null;
              const creator = tiktokCreators[id];
              const choices = tiktokChoices[id] ?? emptyTikTokChoices();
              const duration = media.length === 1 && media[0]?.kind === "video" && media[0].duration_ms != null ? media[0].duration_ms / 1000 : null;
              return <Card key={id}><CardHeader className="pb-3"><CardTitle className="text-sm font-medium">TikTok · {creator?.creator_nickname ?? account.display_name ?? account.handle}</CardTitle></CardHeader><CardContent className="space-y-4">
                {tiktokErrors[id] ? <div className="space-y-2"><p className="text-sm text-destructive">{tiktokErrors[id]}</p><Button type="button" variant="outline" size="sm" onClick={() => setTikTokRetry(n => n + 1)}>Retry TikTok options</Button></div> : !creator ? <p className="text-sm text-muted-foreground">Loading current TikTok posting options…</p> : <>
                  <p className="text-xs text-muted-foreground">One video is required. Account limit: {creator.max_video_post_duration_sec} seconds. {duration ? `Selected video: ${duration.toFixed(1)} seconds.` : "Select a video with a readable duration."}</p>
                  <div><label className="text-xs text-muted-foreground">Who can watch this video?</label><Select value={choices.privacy ?? undefined} onValueChange={privacy => updateTikTok(id, { privacy })}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose privacy" /></SelectTrigger><SelectContent>{creator.privacy_level_options.map(value => <SelectItem key={value} value={value}>{tiktokPrivacy[value] ?? value}</SelectItem>)}</SelectContent></Select></div>
                  {([["allowComments", "Allow comments", creator.comment_disabled], ["allowDuet", "Allow Duet", creator.duet_disabled], ["allowStitch", "Allow Stitch", creator.stitch_disabled]] as const).map(([key, label, disabled]) => <label key={key} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{label}{disabled && <span className="block text-xs text-muted-foreground">Disabled in TikTok account settings</span>}</span><Switch checked={!disabled && choices[key]} disabled={disabled} onCheckedChange={checked => updateTikTok(id, { [key]: checked })} /></label>)}
                  <label className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">Disclose commercial content<span className="block text-xs text-muted-foreground">Turn on if this video promotes a brand, product or service.</span></span><Switch checked={choices.commercialDisclosure} onCheckedChange={checked => updateTikTok(id, { commercialDisclosure: checked, ...(checked ? {} : { promotesOwnBrand: false, brandedContent: false }) })} /></label>
                  {choices.commercialDisclosure && <div className="space-y-2"><p className="text-sm">Who are you promoting?</p><label className="flex items-center gap-2 text-sm"><Checkbox checked={choices.promotesOwnBrand} onCheckedChange={checked => updateTikTok(id, { promotesOwnBrand: checked === true })} /> Your brand</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={choices.brandedContent} onCheckedChange={checked => updateTikTok(id, { brandedContent: checked === true })} /> Branded content</label><p className="text-xs text-muted-foreground">{choices.brandedContent ? "Your video will be labelled Paid partnership. Branded content cannot use Only me privacy." : choices.promotesOwnBrand ? "Your video will be labelled Promotional content." : "Select at least one option."}</p></div>}
                  <label className="flex items-start gap-2 text-sm"><Checkbox checked={choices.consent} onCheckedChange={checked => updateTikTok(id, { consent: checked === true })} /><span>By posting, you agree to TikTok’s <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>{choices.brandedContent && <> and <a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a></>}.</span></label>
                </>}
              </CardContent></Card>;
            })}

            {!scheduledDrawer && <>
            {/* Caption */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">Caption</CardTitle>
                <Button size="sm" variant="ghost" onClick={generateCaption} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Ask Sam
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedPlatforms.includes("youtube") && <div className="space-y-3 rounded-md border p-3">
                  <div><label className="text-xs text-muted-foreground">YouTube title · reviewed before scheduling</label><Input value={youtubeTitle} maxLength={100} onChange={e => setYoutubeTitle(e.target.value)} placeholder="Video title" className="mt-1" /></div>
                  <div><label className="text-xs text-muted-foreground">YouTube description</label><Textarea value={youtubeDescription} maxLength={5000} onChange={e => setYoutubeDescription(e.target.value)} placeholder="Video description shown on YouTube" rows={4} className="mt-1" /></div>
                </div>}
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption, or describe the post and tap Ask Sam…"
                  rows={6}
                  className="resize-none"
                />
                <div className="flex flex-wrap gap-2">
                  {selectedPlatforms.map((p) => {
                    const max = PLATFORM_META[p].max;
                    const length = Math.max(...accounts.filter(a => a.platform === p && selectedAccounts.has(a.id)).map(a => (targetOverrides[a.id]?.caption || caption).length));
                    const over = length > max;
                    return (
                      <Badge key={p} variant={over ? "destructive" : "outline"} className="text-xs">
                        {PLATFORM_META[p].label}: {length} / {max}
                      </Badge>
                    );
                  })}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">First comment (Instagram)</label>
                  <Input
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                    placeholder="#hashtags or extra context"
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Per-target caption variants */}
            {selectedAccounts.size > 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Per-platform caption variants</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Override the caption or first comment for any specific account. Leave blank to use the main caption.
                  </p>
                  {[...selectedAccounts].map((aid) => {
                    const acc = accounts.find((a) => a.id === aid);
                    if (!acc) return null;
                    const Meta = PLATFORM_META[acc.platform];
                    const Icon = Meta?.icon ?? Facebook;
                    const ov = targetOverrides[aid] ?? {};
                    return (
                      <div key={aid} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {acc.display_name ?? acc.handle ?? Meta?.label}
                          <span className="text-xs text-muted-foreground">· {Meta?.label}</span>
                        </div>
                        <Textarea
                          rows={3}
                          placeholder={`Override caption for ${Meta?.label} (optional)`}
                          value={ov.caption ?? ""}
                          onChange={(e) =>
                            setTargetOverrides((prev) => ({
                              ...prev,
                              [aid]: { ...(prev[aid] ?? {}), ...(e.target.value ? { caption: e.target.value } : {}) },
                            }))
                          }
                          className="resize-none text-sm"
                        />
                        {acc.platform === "instagram" && (
                          <Input
                            placeholder="Override first comment (optional)"
                            value={ov.first_comment ?? ""}
                            onChange={(e) =>
                              setTargetOverrides((prev) => ({
                                ...prev,
                                [aid]: { ...(prev[aid] ?? {}), ...(e.target.value ? { first_comment: e.target.value } : {}) },
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Advanced post-format options */}
            <Card>
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Settings2 className="h-4 w-4" /> Advanced options
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{advancedOpen ? "Hide" : "Show"}</span>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    {selectedPlatforms.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Select an account above to see platform-specific options.</p>
                    ) : (
                      <>
                        {/* Post type — options vary by platform */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-muted-foreground">Post type</label>
                            <Select value={postType} onValueChange={(v: any) => setPostType(v)}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="feed">Feed post</SelectItem>
                                {(selectedPlatforms.includes("instagram") || selectedPlatforms.includes("tiktok")) && (
                                  <SelectItem value="reel">Reel / Short video</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          {selectedPlatforms.includes("youtube") && <div>
                            <label className="text-xs text-muted-foreground">YouTube visibility</label>
                            <Select value={youtubeVisibility} onValueChange={(value) => setYoutubeVisibility(value as "public" | "unlisted" | "private")}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="unlisted">Unlisted</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent>
                            </Select>
                            <label className="mt-3 flex items-center justify-between rounded-md border p-3"><span className="text-sm">Made for kids</span><Switch checked={youtubeMadeForKids} onCheckedChange={setYoutubeMadeForKids} /></label>
                          </div>}
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          {/* TikTok interactions are configured per account above. */}
                          {selectedPlatforms.some(p => p !== "tiktok") && <label className="flex items-center justify-between rounded-md border p-3">
                            <span className="text-sm">Disable comments</span>
                            <Switch checked={commentsDisabled} onCheckedChange={setCommentsDisabled} />
                          </label>}
                          {selectedPlatforms.some(p => p !== "tiktok") && <label className="flex items-center justify-between rounded-md border p-3">
                            <span className="text-sm">Branded / paid partnership</span>
                            <Switch checked={brandedContent} onCheckedChange={setBrandedContent} />
                          </label>}
                          <label className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                            <span className="text-sm">
                              Disclose AI-generated content
                              <span className="block text-xs text-muted-foreground">Required by TikTok / Meta when content is AI-made</span>
                            </span>
                            <Switch checked={aiDisclosure} onCheckedChange={setAiDisclosure} />
                          </label>
                        </div>

                        {(selectedPlatforms.includes("instagram") || selectedPlatforms.includes("facebook")) && (
                          <div>
                            <label className="text-xs text-muted-foreground">Location ID (Instagram / Facebook)</label>
                            <Input
                              value={locationId}
                              onChange={(e) => setLocationId(e.target.value)}
                              placeholder="e.g. 213385402041364"
                              className="mt-1"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
            </>}
          </div>

          {/* Live previews */}
          <div className={scheduledDrawer ? "min-w-0" : "space-y-4 lg:sticky lg:top-24 lg:self-start"}>
            {scheduledDrawer && active ? <PlatformPreview key={active.id} platform={active.platform}
              caption={targetOverrides[active.id]?.caption || caption} media={media} fullCaption
              accountName={active.display_name ?? active.handle ?? undefined}
              navigation={previews.length > 1 && <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="Previous channel" onClick={() => setPreviewId(previews[(previewIndex + previews.length - 1) % previews.length].id)}><ChevronLeft /></Button>
                <span className="text-xs tabular-nums text-muted-foreground">{previewIndex + 1} / {previews.length}</span>
                <Button size="icon" variant="ghost" aria-label="Next channel" onClick={() => setPreviewId(previews[(previewIndex + 1) % previews.length].id)}><ChevronRight /></Button>
              </div>} /> : <>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium px-1">Live previews</div>
            {selectedPlatforms.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Select at least one connected account to see how this post will look.
                </CardContent>
              </Card>
            ) : (
              previews.map(a => <PlatformPreview key={a.id} platform={a.platform} caption={targetOverrides[a.id]?.caption || caption} media={media} />)
            )}
            </>}
          </div>
        </div>
      )}
      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Publish now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately publish to {selectedAccounts.size} connected{" "}
              {selectedAccounts.size === 1 ? "account" : "accounts"}
              {selectedPlatforms.length > 0 && ` (${selectedPlatforms.join(", ")})`}.
              {postStatus === "scheduled" && " This replaces the scheduled time for this post."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {currentWorkspace && <details className="text-sm">
            <summary className="cursor-pointer font-medium">Publication email settings</summary>
            <div className="mt-2"><PublishingNotifications workspaceId={currentWorkspace.id} /></div>
          </details>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving || publishingNow} onClick={doPublishNow}>
              <Send className="h-4 w-4 mr-2" /> Publish now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlatformPreview({ platform, caption, media, fullCaption, accountName, navigation }: { platform: Platform; caption: string; media: MediaItem[]; fullCaption?: boolean; accountName?: string; navigation?: React.ReactNode }) {
  const Meta = PLATFORM_META[platform];
  const Icon = Meta.icon;
  const first = media[0];
  // Mirror real platform truncation: IG/TikTok collapse after ~125 chars, FB after ~480.
  const truncate = platform === "instagram" || platform === "tiktok" ? 125 : 480;
  const isTruncated = !fullCaption && caption.length > truncate;
  const shown = isTruncated ? `${caption.slice(0, truncate).trimEnd()}…` : caption;
  const moreLabel = platform === "facebook" ? "See more" : "more";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 flex-row items-center gap-2 space-y-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0"><CardTitle className="text-sm font-semibold">{Meta.label}</CardTitle>{accountName && <p className="truncate text-xs text-muted-foreground">{accountName}</p>}</div>
        {navigation}
      </CardHeader>
      <CardContent className={cn("p-0", fullCaption && first && "grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
        {fullCaption && first && <div aria-label="Post media" className="flex min-w-0 self-start items-start snap-x snap-mandatory overflow-x-auto">
          {media.map(item => <div key={item.id} className="w-full shrink-0 snap-center">
            {item.kind === "video"
              ? <video controls src={item.signed_url} className="block h-auto w-full object-contain" />
              : item.kind === "document" ? <a href={item.signed_url} target="_blank" rel="noreferrer" className="block p-5 text-sm font-semibold underline">Open carousel PDF</a>
              : <img src={item.signed_url} alt={item.alt_text ?? "Scheduled post image"} className="block h-auto w-full object-contain" />}
          </div>)}
        </div>}
        {!fullCaption && <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground text-xs">
          {first ? (
            first.kind === "video" ? (
              <video src={first.signed_url} className="w-full h-full object-cover" muted autoPlay loop />
            ) : first.kind === "document" ? (
              <a href={first.signed_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">Open carousel PDF</a>
            ) : (
              <img src={first.signed_url} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            "No media yet"
          )}
        </div>}
        <div className={fullCaption ? "min-w-0 break-words p-5 text-sm leading-relaxed" : "p-3 text-[13px] leading-[1.45] text-foreground"}>
          {caption ? (
            <FormattedCaption text={shown} platform={platform} />
          ) : (
            <span className="text-muted-foreground italic">Caption will appear here</span>
          )}
          {isTruncated && (
            <span className="text-muted-foreground"> {moreLabel}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Renders a caption with the same line-break, paragraph spacing, hashtag and
 * @mention highlighting that Facebook / Instagram / TikTok use, so the user
 * sees exactly how it will look when published.
 */
function FormattedCaption({ text, platform }: { text: string; platform: Platform }) {
  // Split on blank lines into paragraphs (real platforms preserve paragraph spacing).
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n(?:[^\S\n]*\n)+/);
  const linkClass =
    platform === "facebook"
      ? "text-[#1877F2]"
      : platform === "instagram"
      ? "text-[#00376B]"
      : "text-[#FE2C55]";

  const renderInline = (line: string, key: number) => {
    // Tokenize hashtags, @mentions and URLs.
    const parts = line.split(/(#[\p{L}0-9_]+|@[\w.]+|https?:\/\/\S+)/gu);
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (/^#[\p{L}0-9_]+$/u.test(part) || /^@[\w.]+$/.test(part) || /^https?:\/\//.test(part)) {
            return (
              <span key={i} className={linkClass}>
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="grid gap-4 whitespace-pre-wrap break-words">
      {paragraphs.map((para, pi) => (
        <p key={pi} className="m-0">
          {para.split("\n").map((line, li, arr) => (
            <span key={li}>
              {renderInline(line, li)}
              {li < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
