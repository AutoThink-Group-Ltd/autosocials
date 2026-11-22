import { describe, expect, it } from "vitest";
import { buildNarrativeLibrary } from "../lib/narrative-library";

const original = { id: "idea-1", title: "Gold without guesswork", message: "Know the risk", why: "Clarity", selected: true, type: "Explainer", createdAt: "2026-11-02T00:00:00Z" };
const batches = [
  { id: "batch-1", goal: "", created_at: "2026-11-02T00:00:00Z", narratives: [original] },
  { id: "batch-2", goal: "", created_at: "2026-11-02T01:00:00Z", narratives: [{ ...original, id: "clone", origin: "batch-1:idea-1" }] },
];

describe("narrative library", () => {
  it("keeps Models production requests out of unused narrative ideas", () => {
    const manual = { ...original, id: "models-request", title: "Create my cinematic video", why: "Manual Models request. Selected reference file IDs: none. Create could not finish." };
    const result = buildNarrativeLibrary([...batches, { ...batches[0]!, id: "models-batch", narratives: [manual] }], []);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(original.title);
  });
  it("keeps one original idea and links a built asset created from its clone", () => {
    const library = buildNarrativeLibrary(batches, [{ id: "variant-1", batch_id: "batch-2", angle: original.title, production_plan: { source_narrative_key: "batch-1:idea-1" }, render_jobs: [{ id: "render-1", status: "done", created_at: "2026-11-02T02:00:00Z" }] }]);
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ status: "built", asset_count: 1, latest_variant_id: "variant-1", latest_render_id: "render-1" });
  });

  it("keeps rejected and binned ideas in the library without hiding their assets", () => {
    const asset = { id: "variant-1", batch_id: "batch-1", angle: original.title, production_plan: {}, render_jobs: [{ id: "render-1", status: "done", created_at: "2026-11-02T02:00:00Z" }] };
    for (const libraryStatus of ["rejected", "binned"] as const) {
      const result = buildNarrativeLibrary([{ ...batches[0]!, narratives: [{ ...original, libraryStatus }] }], [asset]);
      expect(result[0]).toMatchObject({ status: libraryStatus, asset_count: 1, latest_render_id: "render-1" });
    }
  });
});
