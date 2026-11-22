import { describe, expect, it } from "vitest";
import { reconcileProductionReferences } from "@/lib/production-plan";

const selected = "11111111-1111-4111-8111-111111111111";
const outside = "22222222-2222-4222-8222-222222222222";

describe("model production references", () => {
  it("binds selected media named only in a semantic role", () => {
    const result = reconcileProductionReferences({ steps: [{ id: "scene", reference_file_ids: [], reference_step_ids: [], reference_roles: [{ source: "file", id: selected, role: "product" }] }] }, [selected]) as { steps: { reference_file_ids: string[] }[] };
    expect(result.steps[0]?.reference_file_ids).toEqual([selected]);
  });

  it("removes model invented or unselected references", () => {
    const result = reconcileProductionReferences({ steps: [{ id: "scene", reference_file_ids: [outside], reference_step_ids: [], reference_roles: [{ source: "file", id: outside, role: "product" }] }] }, [selected]) as { steps: { reference_file_ids: string[]; reference_roles: unknown[] }[] };
    expect(result.steps[0]?.reference_file_ids).toEqual([]);
    expect(result.steps[0]?.reference_roles).toEqual([]);
  });

  it("leaves provider media resolution to the server", () => {
    const result = reconcileProductionReferences({ steps: [{ id: "scene", settings_json: JSON.stringify({ prompt: "Explain the pack sizes", custom_images: ["https://example.com/file.png"], source_url: "https://example.com/file.png" }), reference_file_ids: [selected], reference_step_ids: [], reference_roles: [] }] }, [selected]) as { steps: { settings_json: string; reference_file_ids: string[] }[] };
    expect(JSON.parse(result.steps[0]!.settings_json)).toEqual({ prompt: "Explain the pack sizes" });
    expect(result.steps[0]!.reference_file_ids).toEqual([selected]);
  });

  it("removes unsupported Golpo voice aliases and orphaned logo placement", () => {
    const result = reconcileProductionReferences({ steps: [{ id: "film", capability_id: "golpo-canvas", settings_json: JSON.stringify({ prompt: "Explain", narration_voice: "Charon", logo_position: "br" }), reference_file_ids: [selected], reference_step_ids: [], reference_roles: [] }] }, [selected]) as { steps: { settings_json: string }[] };
    expect(JSON.parse(result.steps[0]!.settings_json)).toEqual({ prompt: "Explain", narration_voice: "female-1" });
  });
});
