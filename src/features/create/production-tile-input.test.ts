import { describe, expect, it } from "vitest";
import { productionTileInput } from "./production-tile-input";

describe("production tile direction", () => {
  const tile = {
    headline: "Give visitors someone to ask.",
    supporting: "A short first sentence. A much longer explanation follows.\nSee the product",
    direction: "Conversation",
  };

  it("keeps complete short copy and varies the showcase and layout", () => {
    expect(productionTileInput(tile, 0)).toMatchObject({
      supporting: "A short first sentence.",
      design: { showcaseKind: "product", composition: "full" },
    });
    expect(productionTileInput(tile, 1).design).toMatchObject({
      showcaseKind: "promotional", composition: "top",
    });
    expect(productionTileInput(tile, 2).design).toMatchObject({
      showcaseKind: "educational", composition: "right",
    });
  });

  it("omits long copy without cutting it into a misleading fragment", () => {
    expect(productionTileInput({ ...tile, supporting: "A".repeat(71) }, 0).supporting).toBe("");
  });
});
