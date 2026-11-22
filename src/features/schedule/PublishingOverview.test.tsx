import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublishingOverview } from "./PublishingOverview";

describe("publishing overview", () => {
  it("shows the earliest scheduled post with its real channels and opens it", () => {
    const open = vi.fn();
    render(<PublishingOverview timezone="UTC" onOpen={open} posts={[
      { id: "later", caption: "Later", status: "scheduled", scheduled_at: "2030-01-03T10:00:00Z", post_targets: [{ platform: "facebook", status: "pending" }], post_media: [] },
      { id: "next", caption: "Next post", status: "scheduled", scheduled_at: "2030-01-02T10:00:00Z", post_targets: [{ platform: "instagram", status: "pending" }], post_media: [] },
      { id: "failed", caption: "Problem", status: "needs_attention", scheduled_at: null, post_targets: [], post_media: [] },
    ]} />);
    expect(screen.getByText("Next post")).toBeInTheDocument();
    expect(screen.getByText(/instagram/)).toBeInTheDocument();
    expect(screen.getByText(/1 post needs attention/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View post/ }));
    expect(open).toHaveBeenCalledWith("next");
  });
});
