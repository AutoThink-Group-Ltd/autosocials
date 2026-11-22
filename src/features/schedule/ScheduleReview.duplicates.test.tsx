import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ScheduleReview } from "./ScheduleReview";

it("makes a repeat selection explicit for the affected account", () => {
  const onChange = vi.fn();
  render(<ScheduleReview items={[{ type: "tile", id: "tile", title: "Design", scheduled_at: "2030-01-01T12:00:00Z", captions: { facebook: "Hello" }, account_ids: [] }]} accounts={[{ id: "fb", platform: "facebook", display_name: "Page", handle: null }]} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" publishingStatus={{ tile: [{ accountId: "fb", platform: "facebook", account: "Page", status: "published", date: null }] }} imageFor={() => undefined} onChange={onChange} onMove={() => {}} onRemove={() => {}} onBack={() => {}} onConfirm={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit post" }));
  expect(screen.getByText(/Select to post again/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenCalledWith("tile:tile", { account_ids: ["fb"], repeat_accounts: ["fb"] });
});

it("requires a fresh repost decision for an old saved plan", () => {
  render(<ScheduleReview items={[{ type: "tile", id: "tile", title: "Design", scheduled_at: "2030-01-01T12:00:00Z", captions: { facebook: "Hello" }, account_ids: ["fb"] }]} accounts={[{ id: "fb", platform: "facebook", display_name: "Page", handle: null }]} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" publishingStatus={{ tile: [{ accountId: "fb", platform: "facebook", account: "Page", status: "published", date: null }] }} imageFor={() => undefined} onChange={() => {}} onMove={() => {}} onRemove={() => {}} onBack={() => {}} onConfirm={() => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("already has this creation");
  expect(screen.getByRole("button", { name: /Confirm and schedule/ })).toBeDisabled();
});


it("shows written text directly and excludes Instagram", () => {
  render(<ScheduleReview items={[{ type: "written", id: "post", title: "A written post", scheduled_at: "2030-01-01T12:00:00Z", captions: { facebook: "Original post text" }, account_ids: ["fb"] }]} accounts={[{ id: "fb", platform: "facebook", display_name: "Page", handle: null }, { id: "ig", platform: "instagram", display_name: "Instagram page", handle: null }]} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" imageFor={() => undefined} onChange={() => {}} onMove={() => {}} onRemove={() => {}} onBack={() => {}} onConfirm={() => {}} />);
  expect(screen.getByText("Original post text")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit post" }));
  expect(screen.getByLabelText(/Instagram page/)).toBeDisabled();
  fireEvent.click(screen.getByRole("tab", { name: "Post text" }));
  expect(screen.getByText(/no separate caption is generated/)).toBeInTheDocument();
  expect(screen.getByLabelText("facebook post text")).toHaveValue("Original post text");
});

it("requires a deliberate repost choice for written content", () => {
  const onChange = vi.fn();
  render(<ScheduleReview items={[{ type: "written", id: "post", title: "Draft", scheduled_at: "2030-01-01T12:00:00Z", captions: { facebook: "Text" }, account_ids: [] }]} accounts={[{ id: "fb", platform: "facebook", display_name: "Page", handle: null }]} timezone="UTC" startNow={false} busy={false} uncertain={false} assumptions="" publishingStatus={{ post: [{ accountId: "fb", platform: "facebook", account: "Page", status: "published", date: null }] }} imageFor={() => undefined} onChange={onChange} onMove={() => {}} onRemove={() => {}} onBack={() => {}} onConfirm={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit post" }));
  expect(screen.getByText(/Select to post again/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(onChange).toHaveBeenCalledWith("written:post", { account_ids: ["fb"], repeat_accounts: ["fb"] });
});
