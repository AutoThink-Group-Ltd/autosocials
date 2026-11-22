import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BrandDnaProgressBanner } from "./BrandDnaProgressBanner";

const { progress } = vi.hoisted(() => ({ progress: vi.fn() }));
vi.mock("@/lib/brand-dna.functions", () => ({ getBrandDnaProgress: progress }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/app/create" }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

it("shows build activity and links to the completed identity", async () => {
  const client = new QueryClient();
  progress
    .mockResolvedValueOnce({
      id: "proof",
      status: "building",
      phase: "Studying your website",
    })
    .mockResolvedValue({ id: "proof", status: "ready" });
  render(
    <QueryClientProvider client={client}>
      <BrandDnaProgressBanner workspaceId="test-workspace" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Building your Brand DNA")).toBeVisible();
  expect(screen.getByText("Studying your website")).toBeVisible();
  await client.refetchQueries({
    queryKey: ["brand-dna-progress", "test-workspace"],
  });
  expect(
    await screen.findByText("Your Brand DNA is ready for review"),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "View Brand DNA" })).toHaveAttribute(
    "href",
    "/app/brand-dna",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss Brand DNA notification" }),
  );
  expect(
    screen.queryByText("Your Brand DNA is ready for review"),
  ).not.toBeInTheDocument();
});
