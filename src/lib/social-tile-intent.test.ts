import { describe, expect, it } from "vitest";
import { isSocialTileRequest, isStandaloneTileRequest, requestedSocialTileCount } from "./social-tile-intent";

describe("explicit social tile requests", () => {
  it("recognises current creation instructions", () => {
    expect(
      isSocialTileRequest("Create five social tiles for our cleaning services"),
    ).toBe(true);
    expect(
      isSocialTileRequest("Can you make static designs for our brand?"),
    ).toBe(true);
  });
  it("does not turn questions or deferred instructions into requests", () => {
    expect(isSocialTileRequest("What are social tiles? ")).toBe(false);
    expect(isSocialTileRequest("Don't create social tiles yet")).toBe(false);
    expect(isSocialTileRequest("Make a video")).toBe(false);
  });
  it("routes the AutoTill brief with either spelling of ten", () => {
    for (const quantity of ["ten", "10"]) {
      const message = `I want ${quantity} social tiles about AutoTill’s plug-and-play website AI agent.`;
      expect(isStandaloneTileRequest(message)).toBe(true);
      expect(requestedSocialTileCount(message)).toBe(10);
    }
    expect(isStandaloneTileRequest("Create ten social tiles for our publishing calendar")).toBe(false);
    expect(isStandaloneTileRequest("How do you design ten social tiles?")).toBe(false);
  });
});
