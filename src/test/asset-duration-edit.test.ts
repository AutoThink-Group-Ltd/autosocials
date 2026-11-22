import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase-admin.server", () => ({ getAdminClient: vi.fn() }));
import { withAssetDuration, type AssetRow } from "../lib/asset-versions.server";

const asset = (topDuration = 30): AssetRow => ({ duration_s: topDuration, production_plan: {
  version: 1, plan_id: "saved-plan", custom: { keep: true },
  direct_video: { audio_mode: "silent", original_message: "Original 30-second request", custom: "retained" },
  direction: { pacing: "Deliver exactly 30 seconds.", custom: "retained" },
  steps: [{ id: "reference_film", capability_id: "higgsfield-wan-reference-video", role: "finished_video", custom: "retained", reference_file_ids: ["photo"], settings: { prompt: "Create a 30-second film. End after 30 seconds. Keep the 130-second archive and 3 seconds of water.", duration: 30, aspect_ratio: "9:16", resolution: "1080p", generate_audio: false } }],
} }) as unknown as AssetRow;

describe("direct asset duration edits", () => {
  it("synchronizes a 30-second provider film to 15 seconds without mutating its source", () => {
    const source = asset();
    const result = withAssetDuration(source, 15);
    expect(result.duration_s).toBe(15);
    expect(result.production_plan).toMatchObject({ direction: { pacing: "Deliver exactly 15 seconds." }, steps: [{ settings: { duration: 15, prompt: "Create a 15-second film. End after 15 seconds. Keep the 130-second archive and 3 seconds of water." } }] });
    expect(source.production_plan).toMatchObject({ steps: [{ settings: { duration: 30 } }] });
  });
  it("repairs a stale provider length even when the top-level duration already matches", () => {
    expect(withAssetDuration(asset(15), 15).production_plan).toMatchObject({ steps: [{ settings: { duration: 15 } }] });
  });
  it("rejects an unsupported provider duration", () => {
    expect(() => withAssetDuration(asset(), 60)).toThrow();
  });
  it("leaves a non-direct production plan unchanged", () => {
    const source = asset();
    const plan = source.production_plan as Record<string, unknown>;
    delete plan["direct_video"];
    expect(withAssetDuration(source, 15)).toEqual({ ...source, duration_s: 15 });
    expect(withAssetDuration(source, 15).production_plan).toBe(source.production_plan);
  });
  it("preserves plan, step and direct-video metadata and original user wording", () => {
    expect(withAssetDuration(asset(), 15).production_plan).toMatchObject({ plan_id: "saved-plan", custom: { keep: true }, direct_video: { original_message: "Original 30-second request", custom: "retained" }, direction: { custom: "retained" }, steps: [{ capability_id: "higgsfield-wan-reference-video", custom: "retained", reference_file_ids: ["photo"] }] });
  });
});
