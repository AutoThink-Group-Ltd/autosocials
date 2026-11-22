import { validChannelCaption, xCaptionLength } from "@/lib/schedule-caption-length";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPrimaryAssetPlayback } from "@/lib/asset-versions.functions";
import { useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, ImageOff, PanelsTopLeft, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScheduleDateTimePicker } from "./ScheduleDateTimePicker";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { channelStatusLabel, type AssetChannelStatus } from "./useAssetPublishingStatus";
import { calendarDays, dateKey, shiftCursor, workspaceInstant } from "./planner";

export type ReviewItem = { type: "tile" | "video" | "written" | "carousel"; id: string; title: string; source_caption?: string | undefined; scheduled_at: string; captions: Record<string, string>; account_ids: string[]; repeat_accounts?: string[] | undefined };
type ReviewAccount = { id: string; platform: string; display_name: string | null; handle: string | null };
const itemKey = (item: ReviewItem) => `${item.type}:${item.id}`;

function ReviewVideo({ item }: { item: ReviewItem }) {
  const playback = useServerFn(getPrimaryAssetPlayback);
  const media = useQuery({
    queryKey: ["schedule-primary-playback", item.id],
    queryFn: () => playback({ data: { id: item.id } }),
    staleTime: 15 * 60_000,
  });
  if (media.data?.url) return <video src={media.data.url} aria-label={item.title} controls playsInline preload="metadata" className="max-h-full max-w-full" />;
  return <span role="status" className="text-sm text-muted-foreground">{media.isPending ? "Loading video…" : "Video preview unavailable"}</span>;
}

export function ScheduleReview({ items, accounts, timezone, startNow, busy, uncertain, assumptions, publishingStatus, bookingMessage, bookingBlocked, firstBookingBlocked, imageFor, onChange, onOpenSettings, onChangePostTime, onMove, onRemove, onBack, onConfirm, onCheckStatus, compact = false }: {
  items: ReviewItem[]; accounts: ReviewAccount[]; timezone: string; startNow: boolean; busy: boolean; uncertain: boolean; assumptions: string;
  publishingStatus?: Record<string, AssetChannelStatus[]>; compact?: boolean; bookingMessage?: string; bookingBlocked?: boolean; firstBookingBlocked?: boolean;
  onOpenSettings?: () => void; onChangePostTime?: (key: string, instant: string) => void;
  imageFor: (item: ReviewItem) => string | undefined; onChange: (key: string, patch: Partial<ReviewItem>) => void; onMove: (from: number, to: number) => void; onRemove: (key: string) => void; onBack: () => void; onConfirm: (mode: "first" | "all") => void; onCheckStatus?: () => void;
}) {
  const [timeEditor, setTimeEditor] = useState<{ day: string; clock: string } | null>(null);
  const zoneLabel = timezone === "Europe/London" ? "UK time" : timezone;
  const historyByAsset = publishingStatus ?? {};
  const [selectedKey, setSelectedKey] = useState(() => items[0] ? itemKey(items[0]) : "");
  const [view, setView] = useState<"post" | "calendar" | "edit">("post");
  const [captionPlatform, setCaptionPlatform] = useState("linkedin");
  const [detailTab, setDetailTab] = useState<"preview" | "captions">("preview");
  const [cursor, setCursor] = useState(() => dateKey(startNow ? new Date() : items[0]?.scheduled_at ?? new Date(), timezone));
  const selected = items.find(item => itemKey(item) === selectedKey) ?? items[0];
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const selectedId = selected ? itemKey(selected) : "";
  const validChannels = !startNow || !items.length || items.every(item => item.account_ids.every(id => items[0]!.account_ids.includes(id)));
  const needsRepeatConfirmation = (item: ReviewItem) => item.account_ids.some(id => (historyByAsset[item.id] ?? []).some(status => status.accountId === id && status.status !== "failed") && !(item.repeat_accounts ?? []).includes(id));
  const unresolvedRepeats = items.some(needsRepeatConfirmation);
  const invalidCaptions = items.some(item => accounts.some(account => item.account_ids.includes(account.id) && !validChannelCaption(item.captions[account.platform] ?? "", account.platform)));
  const firstInvalid = !items[0]?.account_ids.length || accounts.some(account => items[0]?.account_ids.includes(account.id) && (!items[0].captions[account.platform]?.trim() || items[0].captions[account.platform]!.length > (account.platform === "x" ? 280 : 2200)));
  const onDragEnd = (result: DropResult) => { if (result.destination) onMove(result.source.index, result.destination.index); };
  const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const calendarDate = (item: ReviewItem, index: number) => startNow && index === 0 ? dateKey(new Date(), timezone) : dateKey(item.scheduled_at, timezone);
  const openItem = (item: ReviewItem, index: number) => { setTimeEditor(null); setSelectedKey(itemKey(item)); setCursor(calendarDate(item, index)); };
  const days = calendarDays(cursor, "month");
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${cursor.slice(0, 7)}-01T12:00:00Z`));
  const image = selected && imageFor(selected);
  const destinations = accounts.filter(account => selected?.account_ids.includes(account.id));
  const platforms = [...new Set(destinations.map(account => account.platform))];
  const platform = platforms.includes(captionPlatform) ? captionPlatform : platforms[0];
  const caption = platform && selected ? selected.captions[platform] : undefined;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
    <header className={`flex shrink-0 flex-wrap items-center justify-between gap-2 ${compact ? "" : "pr-20"}`}>
      <h3 className="text-lg font-semibold">Review your schedule</h3>
      <div className="flex flex-wrap items-center gap-1">
        {onOpenSettings && <Button type="button" variant="outline" size="sm" disabled={busy || uncertain} onClick={onOpenSettings}>Schedule Settings</Button>}
        <Button type="button" variant="ghost" size="icon" aria-label="Previous post" disabled={selectedIndex <= 0} onClick={() => openItem(items[selectedIndex - 1]!, selectedIndex - 1)}><ChevronLeft /></Button>
        <span aria-live="polite" className="min-w-14 text-center text-sm font-semibold tabular-nums">{selectedIndex + 1} / {items.length}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Next post" disabled={selectedIndex >= items.length - 1} onClick={() => openItem(items[selectedIndex + 1]!, selectedIndex + 1)}><ChevronRight /></Button>
        <Button type="button" variant="outline" size="icon" aria-label={view === "post" ? "Show calendar" : "Show post view"} title={view === "post" ? "Show calendar" : "Show post view"} onClick={() => setView(view === "post" ? "calendar" : "post")}>{view === "post" ? <CalendarDays /> : <PanelsTopLeft />}</Button>
      </div>
    </header>
    {uncertain && !busy ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted p-3 text-sm"><span>The response was interrupted. Some posts may already be scheduled or published.</span><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCheckStatus}>Check post and channel status</Button></div> : assumptions.startsWith("The requested caption model was unavailable") ? <p role="status" className="rounded-xl bg-muted p-3 text-sm">{assumptions}</p> : <p className="sr-only">{assumptions}</p>}
    {bookingMessage && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{bookingMessage}</p>}
    {assumptions.includes("adjusted around existing bookings") && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{assumptions}</p>}
    {unresolvedRepeats && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">A selected account already has this creation. Deselect it, then select it again only if you want to post again.</p>}
    {!validChannels && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Select every channel used in this schedule on the first post, or remove it from later posts.</p>}
    <fieldset disabled={uncertain || busy} className={`flex min-h-0 min-w-0 ${view === "post" && selected?.type !== "written" ? "flex-initial" : "flex-1"}`}>
      {view === "post" && selected ? <article aria-label="Post review" className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-background">
        <header className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0"><h4 className="line-clamp-2 font-display text-xl font-semibold">{selected.title.replace(/\.[^.]+$/, "")}</h4>
            <Popover open={!!timeEditor} onOpenChange={open => {
              const initial = startNow && selectedIndex === 0 ? new Date(Date.now() + 300000).toISOString() : selected.scheduled_at;
              setTimeEditor(open ? { day: dateKey(initial, timezone), clock: time(initial) } : null);
            }}>
            <PopoverTrigger asChild><button type="button" title="Change date and time" className="mt-2 inline-flex max-w-full text-left items-center gap-3 rounded-xl bg-primary px-3.5 py-2 text-primary-foreground">
              <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
              <span>
                <span className="block text-xs font-medium">When this post will publish</span>
                <span className="block text-base font-bold leading-tight tabular-nums @md:text-lg">{startNow && selectedIndex === 0
                  ? "Immediately after confirmation"
                  : <time dateTime={selected.scheduled_at}>{new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(selected.scheduled_at))} · {zoneLabel}</time>}</span>
              </span><Pencil aria-hidden="true" className="size-4 shrink-0" />
            </button></PopoverTrigger>
            {timeEditor && <PopoverContent align="start" aria-label="Change date and time" collisionPadding={12} className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[var(--radix-popover-content-available-height)] space-y-3 overflow-y-auto rounded-2xl p-3 shadow-xl">
              <ScheduleDateTimePicker {...timeEditor} timezone={timezone} onChange={setTimeEditor} />
              <Button type="button" className="w-full" disabled={busy || uncertain || !timeEditor.day || !timeEditor.clock} onClick={() => {
                try {
                  const instant = workspaceInstant(timeEditor.day, timeEditor.clock, timezone);
                  if (Date.parse(instant) < Date.now() + 60000) throw new Error("Choose a time at least one minute ahead.");
                  if (onChangePostTime) onChangePostTime(selectedId, instant);
                  else onChange(selectedId, { scheduled_at: instant });
                  setCursor(timeEditor.day);
                  setTimeEditor(null);
                } catch (error) { toast.error(error instanceof Error ? error.message : "Choose a valid time."); }
              }}>Apply to this post</Button>
            </PopoverContent>}
            </Popover>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDetailTab("captions"); setView("edit"); }}><Pencil className="size-4" />Edit post</Button>
        </header>
        <div className={`grid min-h-0 overflow-hidden ${selected.type === "written" ? "grid-rows-1" : "h-[70dvh] grid-rows-[minmax(0,0.8fr)_minmax(0,1fr)] @md:h-[55cqw] @md:grid-cols-[55%_minmax(0,1fr)] @md:grid-rows-1"}`}>
          {selected.type !== "written" && <div className="flex min-h-0 min-w-0 items-start justify-center overflow-hidden">
            {selected.type === "video" ? <ReviewVideo key={selected.id} item={selected} /> : image ? <img src={image} alt={selected.title} className="aspect-square h-full max-w-full object-contain object-top" /> : <span className="text-sm text-muted-foreground">Image unavailable</span>}
          </div>}
          <div className="flex min-h-0 min-w-0 flex-col p-4">
            <div className="shrink-0"><p className="text-xs font-semibold text-muted-foreground">Publish to</p>
              <div className="mt-1 flex flex-wrap gap-1">{destinations.map(account => <button key={account.id} type="button" aria-pressed={platform === account.platform} onClick={() => setCaptionPlatform(account.platform)} className={`rounded-full border px-2.5 py-1 text-xs ${platform === account.platform ? "border-foreground bg-muted" : ""}`}><span className="capitalize">{account.platform === "linkedin" ? "LinkedIn" : account.platform}</span> · {account.display_name || account.handle}</button>)}</div>
            </div>
            <div key={selectedId + platform} tabIndex={0} aria-label="Post caption" className="mt-3 min-h-0 overflow-y-auto whitespace-pre-wrap break-words border-t pt-3 text-sm leading-relaxed">{caption || (destinations.length ? "Caption required" : "Edit post to select a channel.")}</div>
          </div>
        </div>
      </article> : <div className={view === "edit" ? "min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border" : compact ? "grid min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border bg-background" : "grid min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border bg-background lg:grid-cols-[minmax(0,1fr)_minmax(310px,370px)] lg:overflow-hidden"}>
        {view === "calendar" && <section className={compact ? "min-w-0 p-3" : "min-w-0 p-4 sm:p-5 lg:overflow-y-auto"} aria-label="Schedule calendar">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-semibold">{monthLabel}</h4><p className="text-xs text-muted-foreground">Your posts at a glance</p></div><div className="flex items-center gap-1"><Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={() => setCursor(shiftCursor(cursor, "month", -1))}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={() => setCursor(shiftCursor(cursor, "month", 1))}><ChevronRight className="h-4 w-4" /></Button></div></div>
          <div className="overflow-x-auto"><div className={compact ? "min-w-[350px]" : "min-w-[630px]"}><div className="grid grid-cols-7 border-b">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div key={day} className="pb-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}</div>
            <div className="grid grid-cols-7">{days.map(day => {
              const matching = items.map((item, index) => ({ item, index })).filter(({ item, index }) => calendarDate(item, index) === day);
              return <div key={day} className={`min-h-24 border-b border-r p-1.5 ${day.slice(0, 7) !== cursor.slice(0, 7) ? "bg-muted/30 text-muted-foreground" : ""}`}><span className="mb-1 block px-1 text-xs font-medium">{Number(day.slice(-2))}</span><div className="space-y-1">{matching.map(({ item, index }) => <button key={itemKey(item)} type="button" onClick={() => openItem(item, index)} aria-pressed={selectedId === itemKey(item)} className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-xs transition-colors ${selectedId === itemKey(item) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50 hover:bg-muted"}`}>{imageFor(item) && <img src={imageFor(item)} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />}<span className="min-w-0"><span className="block font-semibold">{startNow && index === 0 ? "Now" : time(item.scheduled_at)}</span><span className="block truncate">{item.title.replace(/\.[^.]+$/, "")}</span></span></button>)}</div></div>;
            })}</div></div></div>
          <div className="mt-4 border-t pt-4"><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Post order</h4><p className="text-xs text-muted-foreground">Drag to move a post into another time slot</p></div>
            <DragDropContext onDragEnd={onDragEnd}><Droppable droppableId="schedule-review" direction="horizontal">{provided => <div ref={provided.innerRef} {...provided.droppableProps} className="flex min-h-16 gap-2 overflow-x-auto pb-2">{items.map((item, index) => <Draggable key={itemKey(item)} draggableId={itemKey(item)} index={index} isDragDisabled={uncertain || busy}>{drag => <div ref={drag.innerRef} {...drag.draggableProps} className={`flex w-44 shrink-0 items-center gap-1 rounded-lg border p-1.5 ${selectedId === itemKey(item) ? "border-primary bg-muted" : "bg-background"}`}><button type="button" {...drag.dragHandleProps} aria-label={`Drag to reorder ${item.title}`} className="cursor-grab rounded p-1 text-muted-foreground"><GripVertical className="h-4 w-4" /></button><button type="button" onClick={() => openItem(item, index)} className="flex min-w-0 items-center gap-2 text-left">{imageFor(item) && <img src={imageFor(item)} alt="" className="h-10 w-10 rounded object-contain" />}<span className="min-w-0 text-xs"><strong className="block">{startNow && index === 0 ? "Publish now" : `${dateKey(item.scheduled_at, timezone).slice(5)} · ${time(item.scheduled_at)}`}</strong><span className="block truncate text-muted-foreground">{item.title.replace(/\.[^.]+$/, "")}</span></span></button></div>}</Draggable>)}{provided.placeholder}</div>}</Droppable></DragDropContext>
          </div>
        </section>}
        <aside className={compact ? "min-w-0 border-t bg-muted/30 p-3" : "min-w-0 border-t bg-muted/30 p-4 sm:p-5 lg:overflow-y-auto lg:border-l lg:border-t-0"} aria-label="Selected post details">
          {selected ? <div className="space-y-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Post {selectedIndex + 1} of {items.length}</p><h4 className="mt-1 break-words text-lg font-semibold leading-tight">{selected.title.replace(/\.[^.]+$/, "")}</h4><p className="mt-1 text-sm text-muted-foreground">{startNow && selectedIndex === 0 ? "Immediately after confirmation" : new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(selected.scheduled_at))}</p></div><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${selected.title}`} onClick={() => onRemove(selectedId)}><Trash2 className="h-4 w-4" /></Button></div>
            <div role="tablist" aria-label="Post details" className="flex rounded-lg bg-muted p-1">{(["preview", "captions"] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={detailTab === tab} onClick={() => setDetailTab(tab)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize ${detailTab === tab ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{tab === "captions" && selected.type === "written" ? "Post text" : tab}</button>)}</div>
            {detailTab === "preview" && <div className="flex aspect-square max-h-[340px] items-center justify-center overflow-hidden rounded-xl border bg-background">{selected.type === "written" ? <p className="h-full w-full overflow-y-auto whitespace-pre-wrap p-4 text-sm leading-relaxed">{Object.values(selected.captions)[0] || "Select a compatible account to review this post."}</p> : image ? <img src={image} alt={`Preview of ${selected.title}`} className="h-full w-full object-contain" /> : <div className="text-center text-sm text-muted-foreground"><ImageOff className="mx-auto mb-2 h-7 w-7" />{selected.type === "video" ? "Video preview unavailable" : "Image unavailable"}</div>}</div>}
            {detailTab === "captions" && <div className="space-y-3 rounded-xl border bg-background p-3"><div><p className="text-sm font-semibold">{selected.type === "written" ? "Post text to be published" : "Captions to be published"}</p><p className="mt-1 text-xs text-muted-foreground">{selected.type === "written" ? "Your original written post is used as the text; no separate caption is generated." : "Review or edit the exact text for each selected platform."}</p></div>{[...new Set(accounts.filter(a => selected.account_ids.includes(a.id)).map(a => a.platform))].map(platform => { const caption = selected.captions[platform] ?? ""; const max = platform === "x" ? 280 : 2200; const length = platform === "x" ? Math.max(caption.length, xCaptionLength(caption)) : caption.length; return <label key={platform} className="block text-sm font-medium"><span className="flex items-center justify-between gap-2"><span><span className="capitalize">{platform}</span> {selected.type === "written" ? "post text" : "caption"}</span><button type="button" className="text-xs font-semibold underline" onClick={async e => { e.preventDefault(); try { await navigator.clipboard.writeText(caption); toast.success("Caption copied"); } catch { toast.error("Could not copy caption. Select the text to copy it."); } }}>{selected.type === "written" ? "Copy post text" : "Copy caption"}</button></span><textarea aria-label={`${platform} ${selected.type === "written" ? "post text" : "caption"}`} className="mt-1 min-h-36 w-full resize-y rounded-lg border bg-background p-3 text-sm font-normal leading-relaxed" value={caption} onChange={e => onChange(selectedId, { captions: { ...selected.captions, [platform]: e.target.value } })} /><span className={`text-xs ${!caption.trim() || length > max ? "text-destructive" : "text-muted-foreground"}`}>{length}/{max.toLocaleString()} characters{!caption.trim() ? selected.type === "written" ? " · Post text required" : " · Caption required" : length > max ? " · Too long" : ""}</span></label>; })}{!selected.account_ids.length && <p className="text-sm text-muted-foreground">Select a channel to review its caption.</p>}</div>}
            <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={selectedIndex === 0} onClick={() => onMove(selectedIndex, selectedIndex - 1)}>Move earlier</Button><Button type="button" variant="outline" size="sm" disabled={selectedIndex === items.length - 1} onClick={() => onMove(selectedIndex, selectedIndex + 1)}>Move later</Button></div>
            {startNow && selectedIndex === 0 ? <p className="rounded-lg bg-background p-3 text-sm">This post starts publishing when you confirm. Include every channel used later in your plan.</p> : <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Date<Input className="mt-1 bg-background" type="date" value={dateKey(selected.scheduled_at, timezone)} onChange={e => { try { onChange(selectedId, { scheduled_at: workspaceInstant(e.target.value, time(selected.scheduled_at), timezone) }); setCursor(e.target.value); } catch {} }} /></label><label className="text-sm font-medium">Time<Input className="mt-1 bg-background" type="time" value={time(selected.scheduled_at)} onChange={e => { try { onChange(selectedId, { scheduled_at: workspaceInstant(dateKey(selected.scheduled_at, timezone), e.target.value, timezone) }); } catch {} }} /></label></div>}
            <div><p className="text-sm font-semibold">Publish to</p><div className="mt-2 grid gap-2">{accounts.map(a => { const history = (historyByAsset[selected.id] ?? []).filter(status => status.accountId === a.id && status.status !== "failed"); const checked = selected.account_ids.includes(a.id); return <label key={a.id} className="rounded-lg border bg-background px-3 py-2 text-sm"><span className="flex cursor-pointer items-center gap-2"><input type="checkbox" disabled={(selected.type === "written" && a.platform === "instagram") || (selected.type === "carousel" && a.platform !== "linkedin")} checked={checked} onChange={() => onChange(selectedId, { account_ids: checked ? selected.account_ids.filter(id => id !== a.id) : [...selected.account_ids, a.id], repeat_accounts: checked ? (selected.repeat_accounts ?? []).filter(id => id !== a.id) : history.length ? [...(selected.repeat_accounts ?? []), a.id] : (selected.repeat_accounts ?? []) })} /><span className="min-w-0 flex-1 truncate">{a.display_name || a.handle}</span><span className="capitalize text-muted-foreground">{a.platform}</span></span>{selected.type === "written" && a.platform === "instagram" && <span className="mt-1 block text-xs text-muted-foreground">Instagram requires an image or video.</span>}{history.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">{history.map(channelStatusLabel).join("; ")} · {checked ? (selected.repeat_accounts ?? []).includes(a.id) ? "Post again selected" : "Deselect and select again to confirm repost" : "Select to post again"}</span>}</label>; })}</div></div>
          </div> : <p className="text-sm text-muted-foreground">No posts selected. Go back to choose creations.</p>}
        </aside>
      </div>}
    </fieldset>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm font-medium">{startNow ? items.length > 1 ? `Publish the first post now and schedule ${items.length - 1} more` : "Publish the post now" : `${items.length} posts ready to schedule`}</p><p className="text-xs text-muted-foreground">{invalidCaptions ? "Each selected channel needs valid post text within its character limit." : "Review times and post text before confirming."}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || uncertain} onClick={onBack}>Back</Button>{startNow && items.length > 1 && !uncertain && <Button type="button" variant="outline" disabled={busy || firstBookingBlocked || firstInvalid || !!(items[0] && needsRepeatConfirmation(items[0]))} onClick={() => onConfirm("first")}>Publish first only</Button>}<Button type="button" disabled={busy || bookingBlocked || !items.length || (!uncertain && (!validChannels || unresolvedRepeats || invalidCaptions || items.some(item => !item.account_ids.length)))} onClick={() => onConfirm("all")}>{busy ? "Scheduling…" : uncertain ? "Retry scheduling" : startNow ? items.length > 1 ? "Publish first & schedule the rest" : "Confirm and publish now" : `Confirm and schedule ${items.length} posts`}</Button></div></div>
  </div>;
}

