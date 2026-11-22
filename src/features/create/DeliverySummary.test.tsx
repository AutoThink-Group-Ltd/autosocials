import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DeliverySummary } from "./DeliverySummary";
import type { AssetChannelStatus } from "@/features/schedule/useAssetPublishingStatus";
const row = (overrides: Partial<AssetChannelStatus>): AssetChannelStatus => ({
  postId: "one",
  postStatus: "scheduled",
  accountId: "fb",
  platform: "facebook",
  account: "Page",
  status: "pending",
  date: "2030-11-19T13:00:12Z",
  ...overrides,
});
it("groups by minute and keeps a failed destination muted with a disclosure", () => {
  const manage = vi.fn();
  render(
    <DeliverySummary
      stage="scheduled"
      onManage={manage}
      receipts={[
        row({}),
        row({
          accountId: "x",
          platform: "twitter",
          account: "Profile",
          status: "failed",
          date: "2030-11-19T13:00:47Z",
        }),
        row({
          postId: "two",
          platform: "linkedin",
          date: "2030-11-19T14:00:00Z",
        }),
      ]}
    />,
  );
  const groups = screen.getAllByLabelText("Channels for this time");
  expect(groups).toHaveLength(2);
  expect(
    within(groups[0]!).getByLabelText("Facebook: Page — Scheduled"),
  ).toHaveClass("bg-ink");
  expect(
    within(groups[0]!).getByLabelText("X: Profile — Failed"),
  ).not.toHaveClass("bg-ink");
  expect(
    within(groups[0]!).getByLabelText("LinkedIn: no delivery"),
  ).not.toHaveClass("bg-ink");
  expect(
    screen.getByText("Delivery details · needs attention").closest("details"),
  ).not.toHaveAttribute("open");
  expect(
    screen.getAllByRole("button", { name: /Manage schedule for post/ }),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", { name: "Manage schedule for post one" }),
  );
  expect(manage).toHaveBeenCalledWith("one");
});
it("links the published icon directly and exposes multiple accounts and unknown channels in details", () => {
  render(
    <DeliverySummary
      stage="published"
      onManage={vi.fn()}
      receipts={[
        row({
          status: "published",
          postStatus: "published",
          permalink: "https://example.com/post",
          date: null,
        }),
        row({
          accountId: "fb2",
          account: "Second",
          status: "failed",
          date: null,
        }),
        row({
          accountId: "other",
          platform: "future-network",
          account: "Other",
          status: "published",
          date: null,
        }),
      ]}
    />,
  );
  expect(screen.getByText("Date unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: /Facebook: Page — Published; Second — Failed; open published post/,
    }),
  ).toHaveAttribute("href", "https://example.com/post");
  expect(
    screen.getByRole("img", { name: "Future-network: Other — Published" }),
  ).toBeInTheDocument();
  const disclosure = screen
    .getByText("Delivery details · needs attention")
    .closest("details")!;
  expect(disclosure).not.toHaveAttribute("open");
  fireEvent.click(
    within(disclosure).getByText("Delivery details · needs attention"),
  );
  expect(disclosure).toHaveAttribute("open");
  expect(
    within(disclosure).getByText("Facebook · Second: Failed"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Review failed delivery for post one" }),
  ).toBeInTheDocument();
});
