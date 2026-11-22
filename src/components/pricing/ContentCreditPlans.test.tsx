import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentCreditPlans } from "./ContentCreditPlans";

describe("monthly credit plan chooser", () => {
  it("shows the selected plan and passes it to checkout", () => {
    const select = vi.fn();
    render(<ContentCreditPlans onSelect={select} />);
    expect(screen.getByText("1,800 credits each month")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Pro$/ }));
    expect(screen.getByText("8,000 credits each month")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("242")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /choose pro/i }));
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ key: "pro", monthlyPricePence: 29900 }));
  });
  it("offers the free plan and its monthly allowance", () => {
    render(<ContentCreditPlans onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Free$/ }));
    expect(screen.getByText("400 credits each month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get started free/i })).toBeInTheDocument();
  });
});
