import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
const testState = vi.hoisted(() => ({ trash: [] as string[], draft: null as any, history: {} as Record<string, any[]>, bookings: [] as Array<{post_id:string; scheduled_at:string; account_ids:string[]}>, saved: vi.fn() }));
vi.mock("@/lib/content-trash", () => ({ contentTrashKey: (ws: string, kind: string) => ["content-trash", ws, kind], listContentTrash: async () => testState.trash }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({useWorkspace: () => ({currentWorkspace:null})}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/schedule-bookings.functions", () => ({ getScheduleBookings: vi.fn(async () => [...testState.bookings]) }));
vi.mock("@/lib/linkedin-carousel.functions", () => ({
  listLinkedInCarousels: vi.fn(async () => [{ id: "deck", title: "A finished deck", complete: true, unreadable: false, coverUrl: "https://example.test/cover.jpg" }]),
  getLinkedInCarousel: vi.fn(async () => ({
    plan: { slides: [
      { id: "cover", headline: "The cover", supporting: "Opening", design: { aspect: "portrait" } },
      { id: "takeaway", headline: "The takeaway", supporting: "Closing", design: { aspect: "portrait" } },
    ] },
    slides: [
      { id: "cover", url: "https://example.test/cover.jpg" },
      { id: "takeaway", url: "https://example.test/takeaway.jpg" },
    ],
  })),
}));
vi.mock("@/lib/creation-schedule.functions", () => ({ suggestPostingCadence: vi.fn(), getTileChannelCaption: vi.fn(async () => ({caption:"Channel draft"})), getScheduleTileCaptions: vi.fn(async () => ({ one: { platform: "linkedin", caption: "Approved LinkedIn copy" } })), getCreationScheduleStatus: vi.fn(), prepareCreationSchedule: vi.fn(), scheduleCreations: vi.fn() }));
vi.mock("./ScheduleAssetGallery", () => ({ ScheduleAssetGallery: () => <div>Asset gallery</div> }));
vi.mock("./ScheduleReview", () => ({ ScheduleReview: ({ onConfirm, onOpenSettings, onRemove, bookingMessage, bookingBlocked, firstBookingBlocked }: { onConfirm: (mode: "all" | "first") => void; onOpenSettings: () => void; onRemove: (key: string) => void; bookingMessage?: string; bookingBlocked?: boolean; firstBookingBlocked?: boolean }) => <div>Prepared schedule{bookingMessage && <p>{bookingMessage}</p>}<button disabled={bookingBlocked} onClick={() => onConfirm("all")}>Confirm batch</button><button disabled={firstBookingBlocked} onClick={() => onConfirm("first")}>Confirm first</button><button onClick={onOpenSettings}>Schedule Settings</button><button onClick={() => onRemove("tile:two")}>Remove two</button></div> }));
vi.mock("./scheduleDraft", () => ({ readScheduleDraft: () => testState.draft, writeScheduleDraft: (...args: any[]) => { testState.saved(...args); return true; }, clearScheduleDraft: vi.fn() }));
vi.mock("./useAssetPublishingStatus", () => ({ channelStatusLabel: () => "Published", useAssetPublishingStatus: () => ({ isPending: false, isSuccess: true, data: testState.history, refetch: async () => ({ isError: false, data: testState.history }) }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => { const data = table === "brand_files" ? [{ id: "one", name: "One.png", storage_path: "ws/one.png" }, { id: "two", name: "Two.png", storage_path: "ws/two.png" }] : []; const chain: any = { select: () => chain, eq: () => chain, not: () => chain, is: () => chain, or: () => chain, in: () => chain, order: () => chain, limit: () => chain, then: (resolve: any) => resolve({ data, error: null }) }; return chain; }, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) } } }));
import { prepareCreationSchedule, scheduleCreations } from "@/lib/creation-schedule.functions";
import { CreationScheduleDialog } from "./CreationScheduleDialog";
const base = { selected: ["tile:one"], destinations: [], day: "2026-11-20", clock: "09:00", startNow: false, items: null, assumptions: "", uncertain: false, requestId: "request", pendingRequest: null };
const props = { open:true, onOpenChange:vi.fn(), workspaceId:"ws", timezone:"UTC", accounts:[], initialTileIds:[], onScheduled:vi.fn(), mode:"pane" as const, onModeChange:vi.fn(), onCommandHandled:vi.fn(), onSelectionCountChange:vi.fn() };
function wrap(node: React.ReactNode) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry:false } } })}>{node}</QueryClientProvider>; }
beforeEach(() => { testState.trash = []; testState.draft = null; testState.history = {}; testState.bookings = []; testState.saved.mockClear(); props.onCommandHandled.mockClear(); props.onSelectionCountChange.mockClear(); });
it("adds sequential items to one live pane and retains them when expanded", async () => {
  const view = render(wrap(<CreationScheduleDialog {...props} command={{sequence:1,keys:["tile:one"]}} />));
  await waitFor(() => expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1));
  view.rerender(wrap(<CreationScheduleDialog {...props} command={{sequence:2,keys:["tile:two"]}} />));
  await waitFor(() => expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(2));
  expect(screen.getByLabelText("Schedule pane")).toHaveTextContent("2/20");
  view.rerender(wrap(<CreationScheduleDialog {...props} mode="dialog" command={null} />));
  await waitFor(() => expect(screen.getByText(/Choose creations/)).toHaveTextContent("2/20"));
});
it("requires confirmation before clearing a prepared plan to add content", async () => {
  testState.draft = { ...base, items: [{ type:"tile", id:"one", title:"One", scheduled_at:"2026-11-20T09:00:00Z", captions:{ facebook:"Edited" }, account_ids:["account"] }] };
  render(wrap(<CreationScheduleDialog {...props} command={{sequence:1,keys:["tile:two"]}} />));
  expect(await screen.findByText("Add to this schedule?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Keep current plan"}));
  expect(screen.getByText("Prepared schedule")).toBeInTheDocument();
  expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1);
});
it("does not add content to an uncertain request", async () => {
  testState.draft = { ...base, uncertain:true, pendingRequest:{ workspace_id:"ws", request_id:"request", items:[], account_ids:[], confirmed:true } };
  render(wrap(<CreationScheduleDialog {...props} command={{sequence:1,keys:["tile:two"]}} />));
  await waitFor(() => expect(props.onCommandHandled).toHaveBeenCalledWith(1));
  expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1);
  expect(testState.saved.mock.calls.every(([, , draft]) => draft.uncertain && draft.pendingRequest)).toBe(true);
});
it("asks before adding an item already published", async () => {
  testState.history = { one: [{ status:"published" }] };
  render(wrap(<CreationScheduleDialog {...props} command={{sequence:1,keys:["tile:one"]}} />));
  expect(await screen.findByText("Add previously published or scheduled content?")).toBeInTheDocument();
  expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(0);
  fireEvent.click(screen.getByRole("button", {name:"Add to schedule"}));
  await waitFor(() => expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1));
});

it("removing a prepared item also removes it from the basket", async () => {
  testState.draft = { ...base, selected:["tile:one","tile:two"], items:[{ type:"tile", id:"one", title:"One", scheduled_at:"2026-11-20T09:00:00Z", captions:{}, account_ids:[] },{ type:"tile", id:"two", title:"Two", scheduled_at:"2026-11-21T09:00:00Z", captions:{}, account_ids:[] }] };
  render(wrap(<CreationScheduleDialog {...props} command={null} />));
  fireEvent.click(await screen.findByRole("button", {name:"Remove two"}));
  await waitFor(() => expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1));
  expect(testState.saved.mock.calls.at(-1)?.[2].selected).toEqual(["tile:one"]);
});

it("shows the selected tile caption without changing the selection", async () => {
  testState.draft = base;
  render(wrap(<CreationScheduleDialog {...props} command={null} />));
  fireEvent.click(await screen.findByText("Manage selection (1/20)"));
  fireEvent.click(await screen.findByRole("button", {name:"View caption"}));
  expect(screen.getByRole("dialog", {name:"One"})).toHaveTextContent("Approved LinkedIn copy");
  expect(props.onSelectionCountChange).toHaveBeenLastCalledWith(1);
});

it("lets the user leave preparation, keep their selection, and retry into review", async () => {
  const { prepareCreationSchedule, scheduleCreations } = await import("@/lib/creation-schedule.functions");
  testState.draft = { ...base, destinations: ["account"], startNow: true };
  vi.mocked(prepareCreationSchedule).mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  })).mockResolvedValueOnce({ items: [{ type: "tile", id: "one", title: "One", scheduled_at: "2031-01-01T09:00:00Z", captions: { linkedin: "Approved" } }], assumptions: "" });
  render(wrap(<CreationScheduleDialog {...props} accounts={[{ id: "account", platform: "linkedin", display_name: "LinkedIn", handle: null, status: "connected", is_enabled: true, expires_at: null }]} />));
  await waitFor(() => expect(screen.getByRole("button", { name: "Prepare schedule" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Prepare schedule" }));
  expect(await screen.findByRole("progressbar")).toHaveValue(0);
  fireEvent.click(screen.getByRole("button", { name: "Back to selection" }));
  fireEvent.click(await screen.findByRole("button", { name: "Prepare schedule" }));
  expect(await screen.findByText("Prepared schedule")).toBeInTheDocument();
  expect(scheduleCreations).not.toHaveBeenCalled();
});

it("removes a trashed first tile from a saved review without transferring immediate publishing", async () => {
  testState.trash = ["one"];
  testState.draft = { ...base, startNow: true, selected: ["tile:one", "tile:two"],
    items: ["one", "two"].map(id => ({ type: "tile", id, title: id, captions: { linkedin: id }, scheduled_at: "2031-11-21T09:00:00Z", account_ids: [] })) };
  render(wrap(<CreationScheduleDialog {...props} />));
  await waitFor(() => expect(testState.saved.mock.calls.at(-1)?.[2]).toMatchObject({
    selected: ["tile:two"], startNow: false, items: [expect.objectContaining({ id: "two", captions: { linkedin: "two" } })],
  }));
});

it("applies weekday and timezone preferences to draft dates only after Apply", async () => {
  const items = ["one", "two"].map((id, index) => ({
    type: "tile", id, title: id, captions: { linkedin: "Edited " + id }, account_ids: ["account"],
    scheduled_at: `2030-03-${29 + index}T09:00:00.000Z`,
  }));
  testState.draft = { ...base, items };
  render(wrap(<CreationScheduleDialog {...props} />));
  const open = await screen.findByRole("button", { name: "Schedule Settings" });
  fireEvent.click(open);
  fireEvent.click(screen.getByLabelText("Exclude weekends"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(testState.saved.mock.calls.at(-1)?.[2].items).toEqual(items);
  fireEvent.click(open);
  expect(screen.getByLabelText("Exclude weekends")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Exclude weekends"));
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/London" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply settings" }));
  await waitFor(() => expect(testState.saved.mock.calls.at(-1)?.[2]).toMatchObject({
    timezone: "Europe/London", excludeWeekends: true,
    items: [items[0], { ...items[1], scheduled_at: "2030-04-01T08:00:00.000Z" }],
  }));
  const { scheduleCreations } = await import("@/lib/creation-schedule.functions");
  expect(scheduleCreations).not.toHaveBeenCalled();
});

it("returns only the rejected post to review after a partial schedule", async () => {
  const { scheduleCreations } = await import("@/lib/creation-schedule.functions");
  const items = ["one", "two"].map((id, index) => ({
    id, type: "tile" as const, title: id, scheduled_at: index ? "2030-11-21T09:00:00Z" : "2030-11-20T09:00:00Z",
    account_ids: ["account"], captions: { linkedin: id },
  }));
  testState.draft = { ...base, items, selected: ["tile:one", "tile:two"], destinations: ["account"] };
  vi.mocked(scheduleCreations).mockResolvedValueOnce({
    scheduled: [{ type: "tile", id: "two", post_id: "post-two", immediate: false }],
    failures: [{ type: "tile", id: "one", error: "Choose a time at least one minute ahead" }],
    confirmation_email: "queued",
  });
  render(wrap(<CreationScheduleDialog {...props} />));
  await waitFor(() => expect(testState.saved).toHaveBeenCalled());
  await screen.findByText("Prepared schedule");
  await waitFor(() => {
    if (!vi.mocked(scheduleCreations).mock.calls.length) fireEvent.click(screen.getByRole("button", { name: "Confirm batch" }));
    expect(scheduleCreations).toHaveBeenCalled();
  });
  expect(await screen.findByText("1 accepted · 1 not scheduled")).toBeInTheDocument();
  expect(screen.getByText("Scheduled", { exact: true, selector: "p" })).toBeInTheDocument();
  expect(screen.getByText(/Choose a time at least one minute ahead/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review failed posts to retry" }));
  expect(testState.saved.mock.calls.at(-1)?.[2].items).toEqual([items[0]]);
  expect(scheduleCreations).toHaveBeenCalledTimes(1);
});

it("updates the open review when the clock advances without submitting a post", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-11-20T08:55:00Z"));
  const { scheduleCreations } = await import("@/lib/creation-schedule.functions");
  const submissions = vi.mocked(scheduleCreations).mock.calls.length;
  try {
    testState.draft = { ...base, timezone: "Europe/London", items: [{
      type: "tile", id: "one", title: "One", scheduled_at: "2030-11-20T09:00:00.000Z",
      captions: { linkedin: "Approved" }, account_ids: ["account"],
    }] };
    render(wrap(<CreationScheduleDialog {...props} />));
    await screen.findByText("Prepared schedule");
    now.mockReturnValue(Date.parse("2030-11-20T09:01:00Z"));
    fireEvent.focus(window);
    await waitFor(() => expect(testState.saved.mock.calls.at(-1)?.[2].items[0].scheduled_at).toBe("2030-11-20T13:00:00.000Z"));
    expect(scheduleCreations).toHaveBeenCalledTimes(submissions);
  } finally {
    now.mockRestore();
  }
});

it("checks fresh bookings at confirmation and preserves reviewed times when a new conflict appears", async () => {
  const { scheduleCreations } = await import("@/lib/creation-schedule.functions");
  const { getScheduleBookings } = await import("@/lib/schedule-bookings.functions");
  vi.mocked(scheduleCreations).mockClear();
  vi.mocked(getScheduleBookings).mockClear();
  const item = { type: "tile", id: "one", title: "One", scheduled_at: "2030-11-20T09:00:00Z", captions: { linkedin: "Post" }, account_ids: ["account"] };
  testState.draft = { ...base, items: [item], destinations: ["account"] };
  render(wrap(<CreationScheduleDialog {...props} />));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirm batch" })).toBeEnabled());
  testState.bookings = [{ post_id: "existing", scheduled_at: "2030-11-20T09:00:30Z", account_ids: ["account"] }];
  fireEvent.click(screen.getByRole("button", { name: "Confirm batch" }));
  await waitFor(() => expect(vi.mocked(getScheduleBookings).mock.calls.length).toBeGreaterThanOrEqual(2));
  expect(scheduleCreations).not.toHaveBeenCalled();
  expect(testState.saved.mock.calls.at(-1)?.[2].items[0].scheduled_at).toBe(item.scheduled_at);
  const lastWindow = vi.mocked(getScheduleBookings).mock.calls.at(-1)![0].data;
  expect(Date.parse(lastWindow.until) - Date.parse(lastWindow.from)).toBeLessThanOrEqual(180000);
});

it("blocks a visible occupied minute but allows the first post independently", async () => {
  const items = ["one", "two"].map((id, index) => ({ type: "tile", id, title: id, scheduled_at: index ? "2030-11-21T09:00:00Z" : "2030-11-20T09:00:00Z", captions: { linkedin: id }, account_ids: ["account"] }));
  testState.draft = { ...base, items, selected: ["tile:one", "tile:two"], destinations: ["account"] };
  testState.bookings = [{ post_id: "existing", scheduled_at: items[1]!.scheduled_at, account_ids: ["account"] }];
  render(wrap(<CreationScheduleDialog {...props} />));
  expect(await screen.findByText(/already has a post at this minute/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm batch" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Confirm first" })).toBeEnabled();
});

it("shows the eligible LinkedIn destination, the full carousel and Publish now", async () => {
  const shared = { handle: null, status: "connected", is_enabled: true, expires_at: "2099-01-01T00:00:00Z" };
  const accounts = [
    { ...shared, id: "linkedin-account", platform: "linkedin", display_name: "LinkedIn Page" },
    { ...shared, id: "facebook-account", platform: "facebook", display_name: "Facebook Page" },
    { ...shared, id: "x-account", platform: "x", display_name: "X profile" },
    { ...shared, id: "youtube-account", platform: "youtube", display_name: "YouTube channel" },
  ];
  render(wrap(<CreationScheduleDialog {...props} accounts={accounts} selectionScope="ws:selection:carousel:deck" command={{ sequence: 1, keys: ["carousel:deck"], focus: true }} />));
  expect(await screen.findByText("A finished deck")).toBeInTheDocument();
  expect(screen.getByText("LinkedIn is the publishing destination for carousel PDFs.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /LinkedIn Page/ })).toBeChecked();
  expect(screen.queryByRole("checkbox", { name: /Facebook Page/ })).toBeNull();
  expect(screen.getByText(/facebook page/i)).toBeVisible();
  expect(screen.getByText(/X profile/)).toBeVisible();
  expect(screen.getByText(/YouTube channel/)).toBeVisible();
  expect(screen.getAllByText("Carousel PDFs use LinkedIn")).toHaveLength(3);
  expect(screen.getByRole("group", { name: "Posting time, 24-hour clock" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Schedule post" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Publish now" })).toBeEnabled();
  expect(screen.queryByText("Asset gallery")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Browse posts" }));
  expect(await screen.findByText("Asset gallery")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Selected posts" }));
  expect(screen.getByText("A finished deck")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preview A finished deck" }));
  const dialog = within(await screen.findByRole("dialog", { name: "A finished deck" }));
  expect(await dialog.findByRole("img", { name: /Slide 1.*The cover/ })).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Next slide" }));
  expect(await dialog.findByRole("img", { name: /Slide 2.*The takeaway/ })).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Close", exact: true }));
  vi.mocked(prepareCreationSchedule).mockResolvedValueOnce({
    items: [{ type: "carousel", id: "deck", title: "A finished deck", scheduled_at: "2031-01-01T09:00:00Z", captions: { linkedin: "Reviewed caption" } }],
    assumptions: "One post per day in selection order. Review each caption, destination and time before confirming.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
  expect(await screen.findByText("Prepared schedule")).toBeVisible();
  expect(testState.saved.mock.calls.at(-1)?.[2]).toMatchObject({ selected: ["carousel:deck"], startNow: true });
  expect(scheduleCreations).not.toHaveBeenCalled();
});
