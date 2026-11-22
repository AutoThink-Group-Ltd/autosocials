import { describe, expect, it } from "vitest";
import {
  tileDesignDraftPayload,
  saveTileDesignInput,
} from "./tile-design-draft";
const id = "10000000-0000-4000-8000-000000000001";
const post = "20000000-0000-4000-8000-000000000002";
const tile = { headline: "Hello", supporting: "World" };
const payload = {
  plan: { brand: "Brand", tiles: [tile] },
  entries: [{ tile, requestId: id, postId: post, status: "pending" }],
};
describe("editable tile manifest", () => {
  it("retains the request ID and design payload", () => {
    const input = saveTileDesignInput.parse({
      workspace_id: id,
      id: post,
      payload,
    });
    expect(tileDesignDraftPayload.parse(input.payload)).toEqual(payload);
  });
  it("rejects duplicate request IDs and invalid versions", () => {
    const duplicated = {
      ...payload,
      plan: { brand: "Brand", tiles: [tile, tile] },
      entries: [payload.entries[0], payload.entries[0]],
    };
    expect(
      saveTileDesignInput.safeParse({
        workspace_id: id,
        id: post,
        payload: duplicated,
      }).success,
    ).toBe(false);
    expect(
      saveTileDesignInput.safeParse({
        workspace_id: id,
        id: post,
        payload,
        version: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
