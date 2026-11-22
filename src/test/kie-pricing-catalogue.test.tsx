import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KiePricingCatalogue } from "@/features/admin/KieCosts";

describe("Kie pricing catalogue", () => {
  it("filters by model name and exact price unit together", () => {
    render(<KiePricingCatalogue />);
    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "nano banana 2" } });
    expect(screen.getByRole("link", { name: /google nano banana 2/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price unit"), { target: { value: "per second" } });
    expect(screen.getByText("No models match these filters.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price unit"), { target: { value: "per image" } });
    expect(screen.getByRole("link", { name: /google nano banana 2/i })).toBeInTheDocument();
  });
});
