import { describe, expect, it } from "vitest";
import { pipelineEntries, selectedNarrativeIdeas } from "./pipeline-plans";

const saved = {
  id: "b",
  title: "Saved",
  goal: "",
  stage: "narratives",
  created_at: "1",
  updated_at: "1",
  narratives: [
    { id: "one", title: "First", message: "First angle", format: "written" },
    { id: "two", title: "Second", message: "Second angle", format: "tiles" },
    { id: "gone", title: "Gone", libraryStatus: "binned" },
  ],
};
describe("pipeline", () => {
  it("moves a saved tile set into Production without breaking its original plan link", () => {
    const canvas = { id: "tile-plan", title: "AutoTill social tiles", version: 1, updated_at: "1", blocks: [
      { type: "social_tiles", title: "AutoTill social tiles", brief: "Ten social tiles", plan: {
        brand: "AutoTill", tiles: Array.from({ length: 10 }, (_, i) => ({ headline: `Tile ${i + 1}`, supporting: "" })),
      } },
    ] };
    const build = { kind: "tile-canvas" as const, signature: canvas.id, title: canvas.title, updated_at: "2", total: 10, done: 4, terminal: false, complete: false };
    const entries = pipelineEntries([canvas], [], [build]);
    expect(entries).toEqual([
      expect.objectContaining({ id: "canvas:tile-plan", stage: "production", active: true, subtitle: "4 of 10 designs ready" }),
      expect.objectContaining({ id: "canvas:tile-plan", stage: "plans", hidden: true }),
    ]);
    expect(pipelineEntries([canvas], [], [{ ...build, done: 10, terminal: true, complete: true }])).toHaveLength(1);
  });
  it("hides completed production from lists but retains direct item, and keeps all canvas block types", () => {
    const entries = pipelineEntries(
      [
        {
          id: "c",
          title: "Research",
          version: 1,
          updated_at: "1",
          blocks: [
            { type: "social_tiles", title: "Tiles", brief: "Make tiles" },
          ],
        },
        {
          id: "campaign-canvas",
          title: "Campaign",
          version: 1,
          updated_at: "1",
          blocks: [
            {
              type: "content_campaign",
              campaignId: "00000000-0000-4000-8000-000000000000",
            },
          ],
        },
      ],
      [{ ...saved, goal: "sam-thread:chat" }],
      [
        {
          kind: "campaign",
          signature: "00000000-0000-4000-8000-000000000000",
          title: "Campaign",
          updated_at: "2",
          total: 0,
          done: 0,
          terminal: true,
          complete: false,
        },
        {
          kind: "campaign-production",
          signature: "camp",
          title: "Campaign",
          updated_at: "2",
          offset: 0,
          total: 12,
          done: 12,
          terminal: true,
          complete: true,
        },
        {
          kind: "personal",
          signature: "other",
          title: "Active",
          updated_at: "2",
          total: 3,
          done: 1,
          terminal: false,
          complete: false,
        },
      ],
    );
    expect(entries.find((e) => e.id === "canvas:c")?.hidden).toBe(false);
    expect(entries.find((e) => e.id === "canvas:campaign-canvas")?.hidden).toBe(
      true,
    );
    expect(entries.some((e) => e.kind === "narrative")).toBe(true);
    expect(
      entries.find((e) => e.id === "campaign-production:camp:0"),
    ).toMatchObject({ hidden: true, active: false, subtitle: "12/12 ready" });
    expect(entries.find((e) => e.id === "personal:other")).toMatchObject({
      active: true,
      subtitle: "1/3 ready",
    });
  });
  it("preserves saved formats and allows an explicit format override", () => {
    expect(
      selectedNarrativeIdeas([saved], ["b:two", "b:one"]).map(
        (item) => item.format,
      ),
    ).toEqual(["tiles", "written"]);
    expect(
      selectedNarrativeIdeas([saved], ["b:two", "b:one"], "video").map(
        (item) => item.format,
      ),
    ).toEqual(["video", "video"]);
  });
  it("rejects removed and excessive selections", () => {
    expect(() => selectedNarrativeIdeas([saved], ["b:gone"])).toThrow();
    expect(() =>
      selectedNarrativeIdeas([saved], Array(21).fill("b:one")),
    ).toThrow();
  });
});

import { linkedUsage, parsePipelineFormat } from "./pipeline-usage";
describe("provable plan usage", () => {
  it("counts distinct ready assets and only posts linked by saved identifiers", () => {
    const outputs = [
      { kind: "tile", id: "a", status: "ready" },
      { kind: "tile", id: "a", status: "ready" },
      { kind: "written", id: "b", status: "ready" },
      { kind: "video", id: "c", status: "queued" },
    ];
    const posts = [
      {
        id: "x",
        status: "scheduled",
        created_via: "social_tile:a",
        variant_id: null,
      },
      {
        id: "y",
        status: "published",
        created_via: "written_post:b",
        variant_id: null,
      },
      {
        id: "z",
        status: "published",
        created_via: "social_tile:unrelated",
        variant_id: null,
      },
    ];
    expect(linkedUsage(outputs, posts, 12)).toEqual({
      planned: 12,
      created: 2,
      scheduled: 1,
      published: 1,
    });
  });
  it("recognises all supported formats without inventing unknown types", () => {
    expect(
      [
        "LinkedIn carousel",
        "social tile",
        "written post",
        "video",
        "research",
      ].map(parsePipelineFormat),
    ).toEqual(["carousel", "tiles", "written", "video", undefined]);
  });
  it("shows archived creative canvases, excludes reports, and keeps unmatched thread narratives", () => {
    const canvases = [
      {
        id: "slides",
        title: "Slides",
        version: 1,
        archived: true,
        updated_at: "1",
        blocks: [
          {
            type: "variants",
            title: "LinkedIn carousel",
            items: [{ angle: "a", hook: "h", format: "LinkedIn carousel" }],
          },
        ],
      },
      {
        id: "report",
        title: "Report",
        version: 1,
        archived: true,
        updated_at: "1",
        blocks: [{ type: "text", text: "report" }],
      },
    ];
    const entries = pipelineEntries(
      canvases,
      [{ ...saved, goal: "sam-thread:thread" }],
      [],
      [{ canvas_id: "slides", thread_id: "thread" }],
    );
    expect(entries.find((e) => e.id === "canvas:slides")?.formats).toEqual([
      "carousel",
    ]);
    expect(entries.some((e) => e.id === "canvas:report")).toBe(false);
    expect(entries.some((e) => e.id === "narrative:b:one")).toBe(true);
  });
});

describe("persistent plans and delivery receipts", () => {
  it("keeps a personal plan visible after production while preserving the historical production ID", () => {
    const usage = { planned: 2, created: 2, scheduled: 1, published: 1 };
    const entries = pipelineEntries(
      [],
      [],
      [
        {
          kind: "personal",
          signature: "p",
          title: "Plan",
          updated_at: "1",
          total: 2,
          done: 2,
          terminal: true,
          complete: true,
          usage,
        },
      ],
    );
    expect(entries.find((e) => e.id === "personal:plan:p")).toMatchObject({
      stage: "plans",
      sourceId: "p",
      usage,
    });
    expect(entries.find((e) => e.id === "personal:p")).toMatchObject({
      stage: "production",
      hidden: true,
      sourceId: "p",
    });
    const draft = pipelineEntries(
      [],
      [],
      [
        {
          kind: "personal",
          signature: "p",
          title: "Plan",
          updated_at: "1",
          total: 2,
          done: 0,
          terminal: true,
          complete: false,
          offset: -1,
          usage,
        },
      ],
    );
    expect(draft.find((e) => e.id === "personal:p")).toMatchObject({
      stage: "plans",
      hidden: true,
    });
  });
  it("uses mixed channel target receipts and does not count failed or draft targets as scheduled", () => {
    const outputs = [{ kind: "tile", id: "asset", status: "ready" }];
    const posts = [
      {
        id: "post",
        status: "partially_published",
        created_via: "social_tile:asset",
        variant_id: null,
        post_targets: [{ status: "published" }, { status: "failed" }],
      },
    ];
    expect(linkedUsage(outputs, posts, 1)).toEqual({
      planned: 1,
      created: 1,
      scheduled: 0,
      published: 1,
    });
    expect(
      linkedUsage(
        outputs,
        [
          {
            ...posts[0]!,
            status: "draft",
            post_targets: [{ status: "pending" }],
          },
        ],
        1,
      ).scheduled,
    ).toBe(0);
    expect(
      linkedUsage(
        outputs,
        [
          {
            ...posts[0]!,
            status: "scheduled",
            post_targets: [{ status: "pending" }],
          },
        ],
        1,
      ).scheduled,
    ).toBe(1);
  });
  it("adds usage to a video brief and narrative only through exact persisted IDs", () => {
    const usage = { planned: 1, created: 1, scheduled: 0, published: 0 };
    const entries = pipelineEntries(
      [],
      [{ ...saved, stage: "briefs" }],
      [
        {
          kind: "video-batch",
          signature: "b",
          title: "",
          updated_at: "1",
          total: 1,
          done: 1,
          terminal: true,
          complete: true,
          usage,
        },
        {
          kind: "video-narrative",
          signature: "b:one",
          title: "",
          updated_at: "1",
          total: 1,
          done: 1,
          terminal: true,
          complete: true,
          usage,
        },
      ],
    );
    expect(entries.find((e) => e.id === "batch:b")?.usage).toEqual(usage);
    expect(entries.find((e) => e.id === "narrative:b:one")?.usage).toEqual(
      usage,
    );
    expect(
      entries.find((e) => e.id === "narrative:b:two")?.usage,
    ).toBeUndefined();
  });
});
