import { describe, expect, it } from "vitest";
import {
  assetStages,
  assetVisibleInStage,
  deduplicateAssets,
  isEligibleVideoRender,
  pipelineIsLoading,
  videoReviewSearch,
} from "./PipelineAssets";
import type { AssetChannelStatus } from "@/features/schedule/useAssetPublishingStatus";
const receipt = (values: Partial<AssetChannelStatus>): AssetChannelStatus => ({
  postId: "post",
  postStatus: "scheduled",
  accountId: "account",
  platform: "facebook",
  account: "Page",
  status: "pending",
  date: "2030-11-19T13:00:00Z",
  ...values,
});
describe("asset pipeline stages", () => {
  it("hides replaced designs from Ready while retaining scheduled and published uses", () => {
    const old = { type: "tile" as const, id: "old", superseded: true };
    expect(assetVisibleInStage(old, "ready", [], new Set())).toBe(false);
    expect(assetVisibleInStage(old, "scheduled", [receipt({})], new Set())).toBe(true);
    expect(assetVisibleInStage(old, "published", [receipt({ status: "published", postStatus: "published" })], new Set())).toBe(true);
  });
  it("uses the same trash and stage rules for lists and counts", () => {
    const trash = new Set(["tile:deleted-tile", "written:deleted-post"]);
    const assets = [
      { type: "tile" as const, id: "deleted-tile" },
      { type: "written" as const, id: "deleted-post" },
      { type: "tile" as const, id: "remaining" },
    ];
    expect(assets.filter((asset) => assetVisibleInStage(asset, "ready", [], trash)).map((asset) => asset.id)).toEqual(["remaining"]);
    expect(assetVisibleInStage(assets[0]!, "scheduled", [receipt({})], trash)).toBe(true);
    expect(assetVisibleInStage(assets[1]!, "published", [receipt({ status: "published", postStatus: "published" })], trash)).toBe(true);
  });
  it("keeps eleven of twelve tiles ready after one is scheduled", () => {
    const tiles = Array.from({ length: 12 }, (_, index) =>
      assetStages({ type: "tile" }, index === 0 ? [receipt({})] : []),
    );
    expect(tiles.filter((stages) => stages.includes("ready"))).toHaveLength(11);
    expect(tiles.filter((stages) => stages.includes("scheduled"))).toHaveLength(
      1,
    );
  });
  it("shows one asset in scheduled and published when channels differ", () => {
    expect(
      assetStages({ type: "tile" }, [
        receipt({}),
        receipt({
          postId: "other",
          postStatus: "published",
          status: "published",
          platform: "linkedin",
        }),
      ]),
    ).toEqual(["scheduled", "published"]);
  });
  it("keeps completed carousel PDFs ready without inventing a delivery", () => {
    expect(assetStages({ type: "carousel" }, [])).toEqual(["ready"]);
  });
  it("does not count a failed delivery as scheduled", () => {
    expect(
      assetStages({ type: "tile" }, [receipt({ status: "failed" })]),
    ).toEqual(["ready"]);
  });
});

it("links unapproved videos to their saved batch review", () => {
  expect(videoReviewSearch("variant", "batch")).toEqual({
    stage: "ready",
    item: "video:variant",
    wizard: "video",
    batch: "batch",
  });
});
it("selects the primary playable render or the latest when none is selected", () => {
  expect(isEligibleVideoRender("old", "primary")).toBe(false);
  expect(isEligibleVideoRender("primary", "primary")).toBe(true);
  expect(isEligibleVideoRender("latest", null)).toBe(true);
  expect(
    deduplicateAssets([
      { type: "video", id: "v", render: "latest" },
      { type: "video", id: "v", render: "old" },
    ]),
  ).toEqual([{ type: "video", id: "v", render: "latest" }]);
});
it("waits for publishing history with only carousel PDFs", () => {
  expect(pipelineIsLoading(false, [{ type: "carousel" }], true)).toBe(true);
  expect(pipelineIsLoading(false, [{ type: "tile" }], true)).toBe(true);
});
