import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Check, ChevronLeft, ChevronRight, FileText, List, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saveUpcomingSchedule, type UpcomingScheduleEdit } from "@/lib/edit-upcoming-schedule.functions";
import { calendarDays, dateKey, shiftCursor, workspaceInstant } from "./planner";
import { ScheduleDateTimePicker } from "./ScheduleDateTimePicker";

type Account = {
  id: string; platform: string; display_name: string | null; handle: string | null;
  is_enabled: boolean; status: string; expires_at: string | null;
};
type UpcomingPost = {
  id: string; caption: string; updated_at: string; status: string; scheduled_at: string | null;
  post_targets: { social_account_id: string; platform: string; status: string }[];
  post_media: { kind: string; url?: string | undefined }[];
};
type CalendarEdit = { post: UpcomingPost; at: string; accountIds: string[] };
const initialEdit = (post: UpcomingPost): CalendarEdit => ({
  post, at: post.scheduled_at!, accountIds: [...new Set(post.post_targets.map((target) => target.social_account_id))],
});
const isChanged = (item: CalendarEdit) => item.at !== item.post.scheduled_at ||
  item.accountIds.length !== item.post.post_targets.length ||
  item.post.post_targets.some((target) => !item.accountIds.includes(target.social_account_id));
const titleFor = (post: UpcomingPost) => post.caption.split("\n")[0]?.trim().slice(0, 120) || "Untitled post";
const names: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok" };
const accountName = (account: Account) => `${names[account.platform] ?? account.platform} · ${account.display_name || account.handle || "Account"}${account.display_name && account.handle && account.handle !== account.display_name ? ` · ${account.handle}` : ""}`;
const canAdd = (account: Account) => account.platform !== "tiktok" && account.is_enabled && account.status === "connected" &&
  (account.platform === "youtube" || (!account.expires_at && account.platform !== "linkedin") || (!!account.expires_at && Date.parse(account.expires_at) > Date.now()));

export function UpcomingScheduleEditor({ workspaceId, accounts, posts, timezone, requiresApproval, autopilotAccounts, refresh }: {
  workspaceId: string; accounts: Account[]; posts: UpcomingPost[]; timezone: string;
  requiresApproval: boolean; autopilotAccounts: string[]; refresh: () => Promise<unknown>;
}) {
  const save = useServerFn(saveUpcomingSchedule);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CalendarEdit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState("");
  const [slot, setSlot] = useState<{ day: string; clock: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [confirmation, setConfirmation] = useState<{ saved: number; unchanged: number; drafts: number } | null>(null);
  const upcoming = posts.filter((post) => post.status === "scheduled" && post.scheduled_at &&
    Date.parse(post.scheduled_at) > Date.now() && post.post_targets.length &&
    post.post_targets.every((target) => target.status === "pending"));
  const changes = rows.filter(isChanged);
  const drafts = changes.filter((item) => !item.accountIds.length).length;
  const ordered = [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.post.id.localeCompare(b.post.id));
  const selected = ordered.find((item) => item.post.id === selectedId);
  const channelRows = checked.size ? rows.filter((item) => checked.has(item.post.id)) : selected ? [selected] : [];
  const index = selected ? ordered.indexOf(selected) : -1;
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format;
  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format;
  const postsByDay = new Map<string, CalendarEdit[]>();
  if (view === "calendar") for (const item of ordered) {
    const day = dateKey(item.at, timezone);
    if (!postsByDay.has(day)) postsByDay.set(day, []);
    postsByDay.get(day)!.push(item);
  }
  const channels = new Map(accounts.map((account) => [account.id, {
    id: account.id, platform: account.platform, label: accountName(account), canAddToNewPosts: !requiresApproval && canAdd(account),
    blockedReason: account.platform === "tiktok" ? "Add in the composer to review TikTok settings" :
      !canAdd(account) ? "Reconnect to add" : "Approval required",
  }]));
  for (const item of channelRows) for (const target of item.post.post_targets) {
    if (!channels.has(target.social_account_id)) channels.set(target.social_account_id, {
      id: target.social_account_id, label: `${names[target.platform] ?? target.platform} · Unavailable account`,
      platform: target.platform, canAddToNewPosts: false, blockedReason: "Reconnect to add",
    });
  }
  const removedFromAutopilotAccount = changes.some((item) => item.post.post_targets.some((target) =>
    autopilotAccounts.includes(target.social_account_id) && !item.accountIds.includes(target.social_account_id)));
  const pick = (item: CalendarEdit) => {
    setSelectedId(item.post.id);
    setMonth(dateKey(item.at, timezone));
    setSlot(null);
  };

  function start() {
    const items = upcoming.map(initialEdit).sort((a, b) => a.at.localeCompare(b.at));
    if (!items[0]) return;
    setRows(items);
    pick(items[0]);
    setChecked(new Set());
    setView("list");
    setError("");
    setDiscard(false);
    setConfirmation(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    if (!confirmation && changes.length) setDiscard(true);
    else setOpen(false);
  }

  function toggle(accountId: string, enabled: boolean) {
    const ids = checked.size ? checked : new Set([selectedId]);
    setRows((items) => items.map((item) => {
      if (!ids.has(item.post.id)) return item;
      if (item.accountIds.includes(accountId) === enabled) return item;
      return { ...item, accountIds: enabled ? [...item.accountIds, accountId] : item.accountIds.filter((id) => id !== accountId) };
    }));
  }

  async function submit() {
    if (busy || !changes.length || changes.length > 1000 || (requiresApproval && drafts !== changes.length)) return;
    setBusy(true);
    setError("");
    const edits: UpcomingScheduleEdit[] = changes.map(({ post, at, accountIds }) => ({
      id: post.id, expected_updated_at: post.updated_at,
      expected_account_ids: post.post_targets.map((target) => target.social_account_id),
      scheduled_at: at, account_ids: accountIds,
    }));
    try {
      const result = await save({ data: { workspaceId, edits } });
      setConfirmation({ saved: result.saved, unchanged: rows.filter((item) => checked.has(item.post.id) && !isChanged(item)).length, drafts });
      await refresh().catch(() => setError("Refresh the planner to see your saved changes."));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the schedule.");
    } finally { setBusy(false); }
  }

  const preview = selected?.post.post_media[0];
  return <>
    <Button variant="outline" disabled={!upcoming.length} onClick={start}><CalendarDays className="mr-2 size-4" />Edit upcoming posts</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      {confirmation ? <DialogContent key="confirmation" className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="bg-ink px-6 py-4"><Logo reversed /></div>
        <div className="space-y-5 p-6">
          <DialogHeader className="space-y-2 text-left">
            <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success"><Check className="size-5" aria-hidden /></span>
            <DialogTitle className="font-display text-xl">Schedule updated</DialogTitle>
            <DialogDescription>{confirmation.saved} {confirmation.saved === 1 ? "post" : "posts"} updated.</DialogDescription>
          </DialogHeader>
          {!!confirmation.unchanged && <p className="text-sm text-muted-foreground">{confirmation.unchanged} selected {confirmation.unchanged === 1 ? "post already matched" : "posts already matched"} the schedule and channels.</p>}
          {!!confirmation.drafts && <p className="text-sm text-muted-foreground">{confirmation.drafts} {confirmation.drafts === 1 ? "post returned" : "posts returned"} to drafts.</p>}
          {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
          <div className="flex justify-end"><Button onClick={close} disabled={busy}>Done</Button></div>
        </div>
      </DialogContent> : <DialogContent key="editor" className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b p-5 pr-12">
          <DialogTitle>Edit upcoming posts</DialogTitle>
          <DialogDescription>{rows.length} upcoming posts · {timezone === "Europe/London" ? "UK time" : timezone}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)] md:overflow-hidden">
          <section className="min-w-0 p-4 md:overflow-auto" aria-label="Upcoming schedule">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Schedule view" className="flex gap-1 rounded-lg bg-muted p-1">
                <Button variant={view === "list" ? "outline" : "ghost"} size="sm" aria-pressed={view === "list"} onClick={() => setView("list")}><List className="size-4" /> Post list</Button>
                <Button variant={view === "calendar" ? "outline" : "ghost"} size="sm" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays className="size-4" /> Calendar</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setChecked(checked.size === rows.length ? new Set() : new Set(rows.map((row) => row.post.id)))}>
                {checked.size === rows.length ? "Clear selection" : "Select all upcoming posts"}
              </Button>
            </div>
            {view === "calendar" && month ? <>
              <div className="mb-3 flex items-center justify-between">
                <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftCursor(month, "month", -1))}><ChevronLeft className="size-4" /></Button>
                <p className="font-semibold">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "T12:00:00Z"))}</p>
                <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(shiftCursor(month, "month", 1))}><ChevronRight className="size-4" /></Button>
              </div>
              <div className="grid grid-cols-7 rounded-lg border">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="p-1 text-center text-xs text-muted-foreground" key={day}>{day}</span>)}
                {calendarDays(month, "month").map((day) => <div key={day} className="min-h-12 min-w-0 space-y-1 border-t p-1">
                  <span className="block text-center text-xs text-muted-foreground">{Number(day.slice(-2))}</span>
                  {(postsByDay.get(day) ?? []).map((item) => <button key={item.post.id} type="button" aria-label={`Open ${titleFor(item.post)} at ${clock(new Date(item.at))}`} aria-pressed={item.post.id === selectedId} onClick={() => pick(item)}
                    className="w-full rounded border p-0.5 text-xs aria-pressed:border-primary aria-pressed:bg-muted">
                    {item.post.post_media[0]?.kind === "image" && item.post.post_media[0]?.url ? <img alt="" src={item.post.post_media[0].url} className="mx-auto aspect-square max-h-12 object-contain" /> : <FileText className="mx-auto size-4" aria-hidden />}
                    <span className="block truncate">{clock(new Date(item.at))}</span>
                  </button>)}
                </div>)}
              </div>
            </> : <ul className="space-y-1.5">
              {ordered.map((item) => <li key={item.post.id} className="flex items-center gap-2 rounded-lg border px-2">
                <input type="checkbox" aria-label={`Select ${titleFor(item.post)}`} checked={checked.has(item.post.id)} onChange={(event) => {
                  const next = new Set(checked);
                  if (event.target.checked) next.add(item.post.id);
                  else next.delete(item.post.id);
                  setChecked(next);
                }} />
                <button type="button" aria-pressed={selectedId === item.post.id} onClick={() => pick(item)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left aria-pressed:bg-muted">
                  {item.post.post_media[0]?.kind === "image" && item.post.post_media[0]?.url && <img alt="" src={item.post.post_media[0].url} className="size-10 rounded object-contain" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{titleFor(item.post)}</span><span className="text-xs text-muted-foreground">{when(new Date(item.at))} · {item.accountIds.length ? `${item.accountIds.length} channels` : "Will return to drafts"}{isChanged(item) && " · Edited"}</span></span>
                </button>
              </li>)}
            </ul>}
          </section>
          {selected && <section className="space-y-4 border-t bg-muted/20 p-4 md:overflow-auto md:border-l md:border-t-0" aria-label="Selected post">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Post {index + 1} of {ordered.length}</p>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" aria-label="Previous post" disabled={index <= 0} onClick={() => pick(ordered[index - 1]!)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon" variant="outline" aria-label="Next post" disabled={index === ordered.length - 1} onClick={() => pick(ordered[index + 1]!)}><ChevronRight className="size-4" /></Button>
              </div>
            </div>
            <h3 className="font-display text-xl font-semibold">{titleFor(selected.post)}</h3>
            <Popover open={!!slot} onOpenChange={(value) => setSlot(value ? { day: dateKey(selected.at, timezone), clock: clock(new Date(selected.at)) } : null)}>
              <PopoverTrigger asChild><Button variant="outline" disabled={requiresApproval} aria-label="Change date and time"><Pencil className="size-4" /> {when(new Date(selected.at))}</Button></PopoverTrigger>
              {slot && <PopoverContent align="start" className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-2rem))] space-y-2 overflow-auto p-3">
                <ScheduleDateTimePicker {...slot} onChange={setSlot} timezone={timezone} />
                <Button className="w-full" onClick={() => {
                  try {
                    const at = workspaceInstant(slot.day, slot.clock, timezone);
                    if (Date.parse(at) < Date.now() + 60_000) throw new Error("Choose a time at least one minute ahead.");
                    setRows((items) => items.map((item) => item.post.id === selectedId ? { ...item, at } : item));
                    setMonth(slot.day);
                    setSlot(null);
                  } catch (failure) { toast.error(failure instanceof Error ? failure.message : "Choose a valid time."); }
                }}>Apply date and time</Button>
              </PopoverContent>}
            </Popover>
            <div><h4 className="mb-2 font-semibold">Publish to <span className="text-xs font-normal text-muted-foreground">· {checked.size ? `${checked.size} selected ${checked.size === 1 ? "post" : "posts"}` : "This post only"}</span></h4><div className="grid gap-2 sm:grid-cols-2">
              {[...channels.values()].map((channel) => {
                const active = channelRows.filter((item) => item.accountIds.includes(channel.id)).length;
                const allOn = active === channelRows.length;
                const mixed = active > 0 && !allOn;
                const supportsDocuments = channel.platform === "linkedin" || !channelRows.some(item =>
                  item.post.post_media.some(media => media.kind === "document")
                );
                const canEnable = supportsDocuments && (channel.canAddToNewPosts || channelRows.every((item) =>
                  item.post.post_targets.some((target) => target.social_account_id === channel.id)));
                return <div key={channel.id} className="rounded-lg border bg-background p-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={allOn} ref={(input) => { if (input) input.indeterminate = mixed; }}
                      aria-label={channel.label} disabled={!active && !canEnable} onChange={() => toggle(channel.id, !active)} />
                    <span>{channel.label}
                      {mixed && <span className="block text-xs text-muted-foreground">On for {active} of {channelRows.length} · Click to turn off for all</span>}
                      {!active && !canEnable && <span className="block text-xs text-muted-foreground">{supportsDocuments ? channel.blockedReason : "Carousel PDFs use LinkedIn."}</span>}
                    </span>
                  </label>
                  {mixed && canEnable && <Button variant="ghost" size="sm" aria-label={`Turn on ${channel.label} for all selected posts`} onClick={() => toggle(channel.id, true)}>Turn on for all</Button>}
                </div>;
              })}
            </div></div>
            {!selected.accountIds.length && <p className="text-sm text-muted-foreground">This post will return to drafts when you save.</p>}
            {requiresApproval && <p className="text-sm text-muted-foreground">This workspace requires approval. To change a scheduled post, return it to drafts and submit it for approval again.</p>}
            {preview?.url && (preview.kind === "video" ? <video src={preview.url} className="max-h-60 w-full rounded-lg object-contain" controls playsInline preload="metadata" /> :
              preview.kind === "document" ? <a href={preview.url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">Open carousel PDF</a> :
              <img alt="" src={preview.url} className="max-h-60 w-full rounded-lg object-contain" />)}
            {selected.post.caption && <p className="whitespace-pre-wrap break-words text-sm">{selected.post.caption}</p>}
          </section>}
        </fieldset>
        <footer className="shrink-0 space-y-2 border-t p-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {removedFromAutopilotAccount && <p className="text-sm text-muted-foreground">Autopilot can still add future posts to channels it uses. Change Autopilot separately.</p>}
          {changes.length > 1000 && <p role="alert" className="text-sm text-destructive">Save up to 1,000 post changes at a time.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{discard ? "Discard your unsaved changes?" : `${changes.length} edited${drafts ? ` · ${drafts} will return to drafts` : ""}`}</p>
            <div className="flex gap-2">{discard ? <>
              <Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button>
              <Button variant="destructive" onClick={() => setOpen(false)}>Discard changes</Button>
            </> : <>
              <Button variant="outline" onClick={close} disabled={busy}>Close</Button>
              <Button onClick={() => void submit()} disabled={busy || !changes.length || changes.length > 1000 || (requiresApproval && drafts !== changes.length)}>{busy ? "Saving…" : "Save changes"}</Button>
            </>}</div>
          </div>
        </footer>
      </DialogContent>}
    </Dialog>
  </>;
}
