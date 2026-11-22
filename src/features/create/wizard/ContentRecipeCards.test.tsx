import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentRecipeCards } from "./ContentRecipeCards";
afterEach(cleanup);
describe("content style selection", () => {
  it("distinguishes Sam's recommendation from the user's selected style", () => {
    render(<ContentRecipeCards available={() => true} recommendedId="branded-motion" selectedId="reaction-demo" onChoose={vi.fn()} />);
    expect(screen.getByText("Sam recommends")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /The wow. Then the how/i })).toHaveAttribute("aria-pressed", "true");
  });
  it("hides cinematic ads and emits only a style selection", () => {
    const choose = vi.fn(); render(<ContentRecipeCards available={() => true} onChoose={choose} />);
    expect(screen.getAllByRole("button")).toHaveLength(3); expect(screen.getAllByText("Illustrative style preview")).toHaveLength(3);
    expect(screen.queryByText("Cinematic ad")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /The wow. Then the how/ })); expect(choose).toHaveBeenCalledWith("reaction-demo");
  });
  it("prevents choosing an unavailable production route", () => {
    render(<ContentRecipeCards available={(style) => style === "brand-motion"} selectedId="branded-motion" onChoose={vi.fn()} />);
    expect(screen.getAllByRole("button").filter((button) => !(button as HTMLButtonElement).disabled)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Big idea|Make your message move/i })).toHaveAttribute("aria-pressed", "true");
  });
});
