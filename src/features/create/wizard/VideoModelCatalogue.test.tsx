import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VideoModelCatalogue } from "./QuickOptions";
import { listVideoStyles } from "@/lib/video-styles";

vi.mock("@/lib/creative.functions", () => ({ getVideoModelOptions: vi.fn() }));
vi.mock("@tanstack/react-start", async (original) => ({ ...await original<typeof import("@tanstack/react-start")>(), useServerFn: (fn: unknown) => fn }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("catalogue provider filtering", () => {
  it("filters the actual catalogue's provider labels without mixing Higgsfield into HyperFrames", () => {
    const models = listVideoStyles();
    render(<VideoModelCatalogue models={models} onChoose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "HyperFrames", exact: true }));
    expect(screen.getAllByRole("button", { name: /^Choose / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Choose Branded Motion", exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Cinematic Scene", exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Higgsfield", exact: true }));
    expect(screen.getAllByRole("button", { name: /^Choose / })).toHaveLength(models.filter((model) => model.provider === "Higgsfield").length);
    expect(screen.getByRole("button", { name: "Choose Cinematic Scene", exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Branded Motion", exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Golpo", exact: true }));
    expect(screen.getAllByRole("button", { name: /^Choose / })).toHaveLength(models.filter((model) => model.provider === "Golpo").length);
    fireEvent.click(screen.getByRole("button", { name: "Kie", exact: true }));
    expect(screen.getAllByRole("button", { name: /^Choose / })).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "Kie · Veo 3.1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose Branded Motion", exact: true })).not.toBeInTheDocument();
  });
});
