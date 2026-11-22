import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialTilesBlock } from "./SocialTilesBlock";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  navigate.mockClear();
});

describe("Sam social tile handoff", () => {
  it("passes the original brief only after the user opens it", () => {
    const listener = vi.fn();
    window.addEventListener("as:social-tiles", listener);
    render(
      <SocialTilesBlock
        workspaceId="workspace-a"
        block={{
          type: "social_tiles",
          title: "Tiles",
          brief: "Create five tiles for cleaning",
        }}
      />,
    );
    expect(sessionStorage.getItem("as:social-tiles:workspace-a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open social tiles" }));
    expect(
      JSON.parse(sessionStorage.getItem("as:social-tiles:workspace-a")!),
    ).toEqual({ brief: "Create five tiles for cleaning" });
    expect(listener).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({ to: "/app/create", search: { stage: "plans", wizard: "tiles" } });
    window.removeEventListener("as:social-tiles", listener);
  });
  it("does not hand off without a selected workspace", () => {
    render(
      <SocialTilesBlock
        workspaceId={null}
        block={{
          type: "social_tiles",
          title: "Tiles",
          brief: "Create five tiles",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open social tiles" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a business");
    expect(navigate).not.toHaveBeenCalled();
  });
});
