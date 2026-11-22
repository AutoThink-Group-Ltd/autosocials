import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/features/create/PipelineAssets", () => ({ usePipelineAssetCounts: () => ({ counts: { ready: 2, scheduled: 3, published: 4 }, isLoading: false, isError: false }) }));
vi.mock("@/features/create/PipelinePlans", () => ({ usePipelinePlanCounts: () => ({ production: 5 }) }));
import { HomeContentLinks } from "./HomeContentLinks";

it("opens each shared content stage", () => {
  render(<HomeContentLinks workspaceId="workspace" />);
  expect(screen.getByRole("link", { name: /^Ready/ })).toHaveTextContent("2");
  expect(screen.getByRole("link", { name: /^In production/ })).toHaveTextContent("5");
  for (const [label, stage] of [["Ready", "ready"], ["In production", "production"], ["Scheduled", "scheduled"], ["Published", "published"]]) {
    expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toHaveAttribute("href", `/app/create?stage=${stage}`);
  }
});
