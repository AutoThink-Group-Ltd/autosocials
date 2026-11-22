vi.mock("@/lib/social-quote.functions", () => ({
  checkDesignQuotation: vi.fn(),
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  saveDraft: vi.fn(),
  render: vi.fn(),
  save: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/brand-dna.functions", () => ({ getCreativeDnaKit: vi.fn().mockResolvedValue(null) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { credits: 45, rateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  }),
}));
vi.mock("@/lib/social-tile-image.functions", () => ({
  generateSocialTileImage: mocks.generate,
  checkSocialTileImage: mocks.check,
  getSocialTileImage: vi.fn(),
  quoteSocialTileImage: vi.fn(),
}));
vi.mock("@/lib/social-tile-storage.functions", () => ({
  saveSocialTiles: mocks.save,
  createSocialTileDrafts: vi.fn(),
}));
vi.mock("./use-design-draft", () => ({
  useDesignDraft: () => ({
    id: "draft",
    version: { current: "version" },
    save: mocks.saveDraft,
  }),
  useDesignLogo: () => undefined,
}));
vi.mock("./render-social-design", () => ({ renderSocialDesign: mocks.render }));
vi.mock("./DesignReferencePicker", () => ({
  DesignReferencePicker: () => null,
}));
import { SocialDesignEditor } from "./SocialDesignEditor";
const design = {
  aspect: "square" as const,
  treatment: "typography" as const,
  composition: "top" as const,
  medium: "Paper",
  accent: "#112233",
  emphasis: "",
  typeface: "sans" as const,
};
const plan = {
  brand: "Example",
  tiles: [{ headline: "A headline", supporting: "Supporting", design }],
};
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.saveDraft.mockResolvedValue(undefined);
  mocks.render.mockResolvedValue(undefined);
});
describe("social design editor", () => {
  it("edits typography in portrait without submitting paid artwork", async () => {
    render(
      <SocialDesignEditor
        workspaceId="workspace"
        plan={plan}
        onBack={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Headline"), {
      target: { value: "Edited title" },
    });
    fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "portrait" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save editable design" }),
    );
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
    expect(mocks.saveDraft.mock.calls[0]![0].tiles[0]).toMatchObject({
      headline: "Edited title",
      design: { aspect: "portrait", treatment: "typography" },
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("persists the artwork request before creating it", async () => {
    const calls: string[] = [];
    mocks.saveDraft.mockImplementation(async () => {
      calls.push("save");
    });
    mocks.generate.mockImplementation(async () => {
      calls.push("generate");
      return { status: "pending" };
    });
    render(
      <SocialDesignEditor
        workspaceId="workspace"
        plan={{
          ...plan,
          tiles: [
            {
              ...plan.tiles[0]!,
              design: { ...design, treatment: "illustration" },
            },
          ],
        }}
        onBack={() => {}}
      />,
    );
    expect(
      screen.getByText("Create missing artwork: 45 credits total"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create artwork" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    expect(calls.slice(0, 2)).toEqual(["save", "generate"]);
    expect(mocks.generate.mock.calls[0]![0].data.identity).toEqual({format:"tile",job_id:mocks.generate.mock.calls[0]![0].data.request_id});
  });
});
