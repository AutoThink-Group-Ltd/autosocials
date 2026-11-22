import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPrimaryAssetPlayback } from "@/lib/asset-versions.functions";
import { describe, expect, it, vi } from "vitest";
import { ScheduleReview, type ReviewItem } from "@/features/schedule/ScheduleReview";

vi.mock("@/lib/asset-versions.functions", () => ({ getPrimaryAssetPlayback: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const items: ReviewItem[] = [
  { type: "tile", id: "one", title: "First", scheduled_at: "2026-11-20T09:00:00.000Z", captions: { facebook: "One" }, account_ids: ["a"] },
  { type: "tile", id: "two", title: "Second", scheduled_at: "2026-11-21T09:00:00.000Z", captions: { facebook: "Two", instagram: "Instagram text\n#example" }, account_ids: ["a", "b"] },
];
const accounts = [{ id: "a", platform: "facebook", display_name: "Page", handle: null }, { id: "b", platform: "instagram", display_name: "Profile", handle: null }];

describe("schedule review", () => {
  it("shows chronological times, blocks invalid immediate channels, and lets the user move or change a post", () => {
    const move = vi.fn(); const change = vi.fn(); const confirm = vi.fn();
    render(<ScheduleReview items={items} accounts={accounts} timezone="UTC" startNow busy={false} uncertain={false} assumptions="Review" imageFor={() => undefined} onChange={change} onMove={move} onRemove={vi.fn()} onBack={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByText("Immediately after confirmation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show calendar" }));
    fireEvent.click(screen.getByRole("tab", { name: "captions" }));
    expect(screen.getByRole("textbox", { name: "facebook caption" })).toHaveValue("One");
    expect(screen.getByRole("button", { name: "Publish first & schedule the rest" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish first only" }));
    expect(confirm).toHaveBeenCalledWith("first");
    expect(screen.getByText("Publish the first post now and schedule 1 more")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move later" }));
    expect(move).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Profile/ }));
    expect(change).toHaveBeenCalledWith("tile:one", { account_ids: ["a", "b"], repeat_accounts: [] });
    fireEvent.click(screen.getByRole("button", { name: /11-21.*Second/ }));
    expect(screen.getByText(/Saturday, 21 November 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-21");
    expect(screen.getByRole("textbox", { name: "instagram caption" })).toHaveValue("Instagram text\n#example");
    fireEvent.change(screen.getByRole("textbox", { name: "instagram caption" }), { target: { value: "  Exact caption  " } });
    expect(change).toHaveBeenCalledWith("tile:two", { captions: { facebook: "Two", instagram: "  Exact caption  " } });
  });
  it("prevents confirmation for a missing selected caption but permits an unchanged retry", () => {
    const invalid = [{ ...items[0]!, captions: { facebook: "  " } }];
    const props = { items: invalid, accounts, timezone: "UTC", startNow: false, busy: false, assumptions: "Review", imageFor: () => undefined, onChange: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onBack: vi.fn(), onConfirm: vi.fn(), onCheckStatus: vi.fn() };
    const { rerender } = render(<ScheduleReview {...props} uncertain={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Show calendar" }));
    fireEvent.click(screen.getByRole("tab", { name: "captions" }));
    expect(screen.getByText(/Caption required/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and schedule 1 posts" })).toBeDisabled();
    rerender(<ScheduleReview {...props} uncertain />);
    expect(screen.getByRole("button", { name: "Retry scheduling" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Check post and channel status" }));
    expect(props.onCheckStatus).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

it("opens on one post and keeps navigation, captions and calendar switching independent of publishing", () => {
  const confirm = vi.fn();
  render(<ScheduleReview compact items={items} accounts={accounts} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" imageFor={item => "/" + item.id + ".png"} onChange={vi.fn()} onMove={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} onConfirm={confirm} />);
  expect(screen.queryByLabelText("Schedule calendar")).toBeNull();
  expect(screen.getByRole("img", { name: "First" })).toBeInTheDocument();
  expect(screen.getByLabelText("Post caption")).toHaveTextContent("One");
  expect(screen.getByRole("button", { name: "Previous post" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next post" }));
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Second" })).toBeInTheDocument();
  expect(screen.getByText(/Saturday, 21 November 2026/)).toHaveTextContent("09:00 · UTC");
  fireEvent.click(screen.getByRole("button", { name: /instagram · Profile/i }));
  expect(screen.getByLabelText("Post caption")).toHaveTextContent("Instagram text #example");
  fireEvent.click(screen.getByRole("button", { name: "Show calendar" }));
  expect(screen.getByLabelText("Schedule calendar")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show post view" }));
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous post" }));
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
});

it("plays the selected video's primary render in its original proportions", async () => {
  vi.mocked(getPrimaryAssetPlayback).mockResolvedValue({ url: "https://media.example/approved.mp4" });
  render(<QueryClientProvider client={new QueryClient()}><ScheduleReview items={[{ ...items[0]!, type: "video", title: "Original film" }]} accounts={accounts} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" imageFor={() => undefined} onChange={vi.fn()} onMove={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} onConfirm={vi.fn()} /></QueryClientProvider>);
  const player = await screen.findByLabelText("Original film");
  expect(player.tagName).toBe("VIDEO");
  expect(player).toHaveAttribute("controls");
  expect(player).toHaveAttribute("src", "https://media.example/approved.mp4");
  expect(getPrimaryAssetPlayback).toHaveBeenCalledWith({ data: { id: "one" } });
});
it("changes an immediate post to a specific time from its date badge", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2031-07-10T09:00:00Z"));
  const changeTime = vi.fn();
  render(<ScheduleReview items={items} accounts={accounts} timezone="Europe/London" startNow busy={false} uncertain={false} assumptions="" imageFor={() => undefined} onChange={vi.fn()} onChangePostTime={changeTime} onMove={vi.fn()} onRemove={vi.fn()} onBack={vi.fn()} onConfirm={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /When this post will publish/ }));
  now.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: /16th,? July|July 16th|16 July/i }));
  fireEvent.click(screen.getByRole("button", { name: /Choose hour,/ }));
  fireEvent.click(within(screen.getByRole("group", { name: "Hours" })).getByRole("button", { name: "14" }));
  fireEvent.click(screen.getByRole("button", { name: /Choose minute,/ }));
  fireEvent.click(within(screen.getByRole("group", { name: "Minutes" })).getByRole("button", { name: "30" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply to this post" }));
  expect(changeTime).toHaveBeenCalledWith(`${items[0]!.type}:${items[0]!.id}`, "2031-07-16T13:30:00.000Z");
});
