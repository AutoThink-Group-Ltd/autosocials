import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { dateKey } from "@/features/schedule/planner";
import { HomeSchedule } from "./HomeSchedule";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "workspaces") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { timezone: "America/New_York" } }) }) }) };
      }
      const month = dateKey(new Date(), "America/New_York").slice(0, 7);
      const result = { data: [{
        id: "p1", status: "scheduled", caption: "Evening post", scheduled_at: month + "-13T01:00:00Z",
        post_targets: [{ platform: "linkedin" }], post_media: [],
      }, { id: "p2", status: "published", caption: "Published yesterday", scheduled_at: null, published_at: month + "-11T18:00:00Z", post_targets: [], post_media: [] }] };
      const chain = { select: () => chain, eq: () => chain, in: () => chain, or: () => chain, order: () => chain, range: () => chain,
        then: (resolve: (value: typeof result) => void) => resolve(result) };
      return chain;
    },
  },
}));

it("marks scheduled days and previews the selected day's posts in workspace time", async () => {
  render(<QueryClientProvider client={new QueryClient()}><HomeSchedule workspaceId="workspace" /></QueryClientProvider>);
  const day = await screen.findByRole("button", { name: /12 .*1 post$/ });
  expect(within(day).getByText("Evening post")).toBeInTheDocument();
  expect(within(await screen.findByRole("button", { name: /11 .*1 post$/ })).getByText("published")).toBeInTheDocument();
  fireEvent.click(day);
  const pane = within(screen.getByRole("region", { name: "Day preview" }));
  expect(pane.getByText("Evening post")).toBeInTheDocument();
  expect(pane.getByText("linkedin")).toBeInTheDocument();
  expect(pane.getByRole("link", { name: "Open in Publish" })).toHaveAttribute("href", "/app/schedule?post=p1");
  fireEvent.click(screen.getByRole("button", { name: /13 \w+ \d{4}$/ }));
  expect(pane.getByText("No posts scheduled for this day.")).toBeInTheDocument();
  expect(pane.queryByText("Evening post")).not.toBeInTheDocument();
});
