import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UpcomingScheduleEditor } from "./UpcomingScheduleEditor";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => save }));
vi.mock("@/lib/edit-upcoming-schedule.functions", () => ({ saveUpcomingSchedule: save }));

const account = (id: string, name: string) => ({
  id, platform: id, display_name: name, handle: null, is_enabled: true,
  status: "connected", expires_at: "2099-12-30T09:00:00Z",
});
const post = (id: string, day: string, targets: string[], status = "scheduled") => ({
  id, caption: id, status, updated_at: "2099-10-23T09:00:00.123456+00:00", scheduled_at: `2099-11-${day}T09:00:00+00:00`,
  post_targets: targets.map((platform) => ({ platform, social_account_id: platform, status: "pending" })), post_media: [],
});
const accounts = [account("facebook", "My Page"), account("linkedin", "My Profile"), account("x", "My Handle")];

it("lets people navigate the full schedule and save dates and channels together", async () => {
  save.mockReset();
  save.mockResolvedValue({ saved: 2 });
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<UpcomingScheduleEditor workspaceId="workspace" timezone="UTC" requiresApproval={false} autopilotAccounts={[]} refresh={refresh}
    accounts={accounts}
    posts={[post("First", "23", ["facebook", "linkedin", "x"]), post("Second", "24", ["facebook", "linkedin", "x"]), post("Published", "22", ["facebook"], "published")]} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit upcoming posts" }));
  expect(screen.getByText("2 upcoming posts · UTC")).toBeInTheDocument();
  expect(screen.queryByText("Published")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select all upcoming posts" }));
  const detail = within(screen.getByRole("region", { name: "Selected post" }));
  fireEvent.click(detail.getByRole("checkbox", { name: /Facebook/ }));
  fireEvent.click(detail.getByRole("checkbox", { name: /My Handle/ }));
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  fireEvent.click(screen.getByRole("button", { name: "Calendar", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Open Second at 09:00" }));

  expect(detail.getByRole("checkbox", { name: /Facebook/ })).not.toBeChecked();
  expect(detail.getByRole("checkbox", { name: /LinkedIn/ })).toBeChecked();
  fireEvent.click(detail.getByRole("checkbox", { name: /My Handle/ }));
  fireEvent.click(detail.getByRole("button", { name: "Change date and time" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose hour, 09" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Hours" })).getByRole("button", { name: "10", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Apply date and time" }));
  expect(save).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({
    data: { workspaceId: "workspace", edits: [
      { id: "First", expected_updated_at: "2099-10-23T09:00:00.123456+00:00", expected_account_ids: ["facebook", "linkedin", "x"], scheduled_at: "2099-11-23T09:00:00+00:00", account_ids: ["linkedin"] },
      { id: "Second", expected_updated_at: "2099-10-23T09:00:00.123456+00:00", expected_account_ids: ["facebook", "linkedin", "x"], scheduled_at: "2099-11-24T10:00:00.000Z", account_ids: ["linkedin", "x"] },
    ] },
  }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("turns mixed channels off across all selected posts and confirms the actual save count", async () => {
  save.mockReset();
  save.mockResolvedValue({ saved: 7 });
  const posts = Array.from({ length: 8 }, (_, index) => post(`Post ${index + 1}`, String(23 + index),
    index === 0 ? ["linkedin"] : ["facebook", "linkedin", "x"]));
  render(<UpcomingScheduleEditor workspaceId="workspace" timezone="UTC" requiresApproval={false} autopilotAccounts={[]}
    refresh={vi.fn().mockResolvedValue(undefined)} accounts={accounts} posts={posts} />);

  fireEvent.click(screen.getByRole("button", { name: "Edit upcoming posts" }));
  fireEvent.click(screen.getByRole("button", { name: "Select all upcoming posts" }));
  const facebook = screen.getByRole("checkbox", { name: /Facebook/ });
  const x = screen.getByRole("checkbox", { name: /My Handle/ });
  expect(facebook).toBePartiallyChecked();
  expect(x).toBePartiallyChecked();
  fireEvent.click(facebook);
  fireEvent.click(x);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  const confirmation = await screen.findByRole("dialog", { name: "Schedule updated" });
  expect(save).toHaveBeenCalledExactlyOnceWith({ data: { workspaceId: "workspace", edits: posts.slice(1).map((item) => ({
    id: item.id, expected_updated_at: item.updated_at, expected_account_ids: ["facebook", "linkedin", "x"],
    scheduled_at: item.scheduled_at, account_ids: ["linkedin"],
  })) } });
  expect(within(confirmation).getByLabelText("AutoSocials")).toBeInTheDocument();
  expect(within(confirmation).getByText("7 posts updated.")).toBeInTheDocument();
  expect(within(confirmation).getByText("1 selected post already matched the schedule and channels.")).toBeInTheDocument();
  fireEvent.click(within(confirmation).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
