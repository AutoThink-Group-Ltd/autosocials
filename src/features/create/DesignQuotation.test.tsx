import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DesignQuotation } from "./DesignQuotation";
import { founderQuotes } from "@/lib/social-quote-sources";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/social-quote.functions", () => ({
  checkDesignQuotation: check,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("applies verified words with intentional line breaks and keeps the old copy on a failed check", async () => {
  const original = founderQuotes[0]!;
  const update = vi.fn();
  render(
    <DesignQuotation
      workspaceId="workspace"
      quote={original}
      onChange={update}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit quote" }));
  const words = original.text.replace("great work", "great\nwork");
  fireEvent.change(screen.getByLabelText("Quotation"), {
    target: { value: words },
  });
  check.mockResolvedValueOnce(null).mockResolvedValueOnce(original);
  fireEvent.click(
    screen.getByRole("button", { name: "Check and apply quote" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be verified",
  );
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Check and apply quote" }),
  );
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ ...original, text: words }),
  );
});
