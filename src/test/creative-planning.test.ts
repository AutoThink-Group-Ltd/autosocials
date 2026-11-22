import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ chat: vi.fn(), context: vi.fn(), availability: vi.fn() }));
vi.mock("@/lib/dossier.server", () => ({ aiChat: mocked.chat }));
vi.mock("@/lib/creative-context.server", () => ({ loadCreativeContext: mocked.context }));
vi.mock("@/lib/playbook.server", () => ({ HOUSE_RULES: "Keep claims truthful.", CREATIVE_PLAYBOOK: "Apply audience insight and meaningful composition." }));
vi.mock("@/lib/creative-providers/adapters.server", () => ({ getCreativeProviderAvailability: mocked.availability }));
import { planProductionAssets, proposeProductionNarratives } from "@/lib/creative-planning.server";
import type { CreativeDirection } from "@/lib/creative-direction";
import { BUILTIN_NAMES } from "@/lib/integrations";
import { selectVideoStyle, videoStyleForNarrative } from "@/lib/video-styles";

const fileId = "11111111-1111-4111-8111-111111111111";
const direction: CreativeDirection = {
  audience: "Office lunch packers", objective: "Product page visit", insight: "Lunch is a small daily ritual",
  argument: "A container for a considered lunch", hook: "A quiet desk lunch unpacked",
  story_mechanism: "Sensory object choreography", composition: "Overhead still life with negative space",
  typography: "Restrained editorial labels", motion: "Object reveals matched to natural hand action",
  imagery: "Authorised packshot", sound: "Calm narration and a quiet pause",
  pacing: "Slow reveal then detail", ending: "Product stays in use beside a small invitation",
  evidence: "Approved product packshot", asset_strategy: "Owned still and intentional typography",
};
const proposal = { direction, steps: [], assumptions: [] };
const narrative = () => ({ title: "Make lunch a ritual", message: "A considered lunch moment", why: "Fits a familiar office occasion", type: "Promotional", treatment: "Overhead product choreography with restrained editorial type.", style_id: "brand-motion", production: proposal });
const selected = { id: "n1", title: "Make lunch a ritual", message: "A considered lunch moment", why: "A familiar occasion", selected: true, type: "Promotional" };
const asset = () => ({ day: 1, angle: selected.title, argument: direction.argument, hook: direction.hook, format: "Editorial product film", duration_s: 15, size: "1080x1920", beats: ["Unpack lunch", "Enjoy the ritual"], voiceover: "Take a moment for your lunch. See the container on our website.", script: "Owned product still, deliberate crop and a patient hold.", caption: "A considered lunch", cta: "See the product", file_ids: [fileId], style_id: "brand-motion", production_plan: proposal });
const plan = () => ({ title: "Lunch ritual", audience: direction.audience, offer: "", voice: BUILTIN_NAMES[0], voice_reason: "A calm voice supports the ritual.", variants: [asset()] });
const reply = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
const admin = {} as Parameters<typeof proposeProductionNarratives>[0]["admin"];
beforeEach(() => {
  vi.resetAllMocks();
  mocked.context.mockResolvedValue({ text: "Uploaded product still; no test claims.", evidence: [], recent: [], files: [{ id: fileId, name: "container.png", kind: "image", mime: "image/png" }], brand: "Example", website: null });
  mocked.availability.mockReturnValue([{ capabilityId: "autotoast-hyperframes", available: true }]);
});

describe("production narrative planning", () => {
  it("attaches current owned pixels to ideation and carries context limitations into the plan", async () => {
    mocked.context.mockResolvedValue({ text: "Actual pixels attached for file:owned.", evidence: [], recent: [], files: [], imageParts: [{ fileId: "owned", name: "product.png", dataUrl: "data:image/png;base64,AAAA" }], assumptions: ["Website retrieval unavailable."] });
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: [] }));
    const result = await proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 });
    const content = mocked.chat.mock.calls[0]![0].messages[1].content;
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
    expect(result[0]!.production.assumptions).toContain("Website retrieval unavailable.");
    expect(typeof mocked.chat.mock.calls[1]![0].messages[1].content).toBe("string");
  });
  it("returns clear treatment and complete direction with the healthy existing pipeline", async () => {
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: [] }));
    const result = await proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 });
    expect(result[0]!.production.steps).toEqual([]);
    expect(result[0]!.production.direction).toEqual(direction);
    expect(result[0]!.treatment).toContain("Overhead");
    expect(mocked.chat).toHaveBeenCalledTimes(2);
    expect(mocked.chat.mock.calls[0]![0].messages[0].content).toContain("AVAILABLE CAPABILITIES");
    expect(mocked.chat.mock.calls[1]![0].messages[0].content).toContain("independently critique");
  });
  it("enforces exact count with one full rework and never returns a partial proposal", async () => {
    mocked.chat.mockResolvedValue(reply({ narratives: [] }));
    await expect(proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 2 })).rejects.toThrow(/unresolved after one rework/);
    expect(mocked.chat).toHaveBeenCalledTimes(2);
  });
  it("preserves independent critique failures after the bounded rework", async () => {
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: ["The proof implies an unsupported product benefit."] }))
      .mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: ["The proof still implies an unsupported product benefit."] }));
    await expect(proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 })).rejects.toThrow(/still implies/);
    expect(mocked.chat).toHaveBeenCalledTimes(4);
  });
  it("does not turn unavailable critique into approval", async () => {
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockRejectedValueOnce(new Error("Critic unavailable"))
      .mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockRejectedValueOnce(new Error("Critic unavailable"));
    await expect(proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 })).rejects.toThrow(/Critic unavailable/);
  });
  it("compares recent scoped history even when critic reports no issues", async () => {
    mocked.context.mockResolvedValue({ text: "Evidence", files: [], recent: [{ workspace_id: "ours", hook: direction.hook, direction }] });
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: [] }))
      .mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ issues: [] }));
    await expect(proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 })).rejects.toThrow(/recent asset/);
  });
  it("rejects unavailable provider treatments before critique", async () => {
    const n = narrative();
    const bad = { ...n, production: { ...proposal, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative scene", role: "scene", settings_json: '{"prompt":"A lunch ritual"}', reference_file_ids: [], reference_step_ids: [], illustrative: true }] } };
    mocked.chat.mockResolvedValue(reply({ narratives: [bad] }));
    await expect(proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 })).rejects.toThrow(/not connected/);
    expect(mocked.chat).toHaveBeenCalledTimes(2);
  });
});

describe("production asset planning", () => {
  it("reassesses a legacy composition route instead of locking its inferred engine", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "higgsfield-seedance-text-video", available: true }, { capabilityId: "autotoast-hyperframes", available: true }]);
    const legacy = { ...selected, production: { version: 1 as const, ...proposal, diversity_issues: [] } };
    const route = { ...proposal, direction: { ...direction, asset_strategy: "An illustrative object scene makes the lunch ritual tangible; composition assembles it without depicting unsupported product results." }, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative lunch ritual", role: "scene", settings_json: '{"prompt":"A quiet lunch ritual","duration":5}', reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true }] };
    const p = { ...plan(), variants: [{ ...asset(), style_id: "cinematic-scene", production_plan: route }] };
    for (const picked of [legacy, { ...legacy, video_style: videoStyleForNarrative(legacy)! }]) {
      mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
      const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [picked], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] });
      expect(result.variants[0]!.production_plan.video_style.id).toBe("cinematic-scene");
      expect(result.variants[0]!.production_plan.direction!.asset_strategy).toBe(route.direction.asset_strategy);
    }
    expect(mocked.chat).toHaveBeenCalledTimes(4);
  });
  it("allows an intentional same-engine batch and requests a concise saved selection rationale", async () => {
    const p = plan();
    const picked = [selected, { ...selected, id: "n2", title: "Pack tomorrow's lunch" }, { ...selected, id: "n3", title: "A thoughtful desk break" }];
    p.variants = picked.map((n) => ({ ...asset(), angle: n.title, production_plan: { ...proposal, direction: { ...direction, asset_strategy: "Editorial object choreography makes this narrative's ritual legible using the approved product still." } } }));
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }))
      .mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked, specs: picked.map((n) => ({ narrative: n.title, duration: 15, size: "1080x1920" })) });
    expect(result.variants.every((v) => v.production_plan.video_style.id === "brand-motion")).toBe(true);
    expect(result.variants.every((v) => v.production_plan.direction!.asset_strategy.includes("Editorial object choreography"))).toBe(true);
    const prompt = mocked.chat.mock.calls[0]![0].messages[0].content;
    expect(prompt).toContain("not a user-selected engine");
    expect(prompt).toContain("Sparse owned media does not automatically require typography");
    expect(prompt).toContain("or change an intentional same-engine choice merely for variety");
    expect(prompt).toContain("production.direction.asset_strategy");
  });
  it("lets Sam choose a style per narrative and saves registry-derived engine intent", async () => {
    mocked.chat.mockResolvedValueOnce(reply({ narratives: [narrative()] })).mockResolvedValueOnce(reply({ reviews: [{ index: 1, blocking_issues: [], creative_issues: [] }] }));
    const result = await proposeProductionNarratives({ admin, workspaceId: "ours", existing: [], count: 1 });
    expect(result[0]!.video_style).toMatchObject({ id: "brand-motion", name: "Branded Motion", engine_ids: ["autotoast-hyperframes"], availability: "configured_unverified" });
    expect(result[0]!.production.video_style).toEqual(result[0]!.video_style);
    expect(mocked.chat.mock.calls[0]![0].messages[0].content).toContain("VIDEO STYLE CATALOGUE");
  });
  it("identifies the intended engine when asset planning attempts to substitute another route", async () => {
    const video_style = selectVideoStyle("cinematic-scene", { steps: [{ capability_id: "higgsfield-seedance-text-video", role: "scene" }] }, new Set(["higgsfield-seedance-text-video"]));
    mocked.chat.mockResolvedValue(reply(plan()));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [{ ...selected, video_style }], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] })).rejects.toThrow(/Cinematic Scene style is intended for Seedance 2.0/);
    expect(mocked.chat).toHaveBeenCalledTimes(2);
  });
  it("preserves the narrative's style and engine while using a generated scene in compositor assembly", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "higgsfield-seedance-text-video", available: true }]);
    const video_style = selectVideoStyle("cinematic-scene", { steps: [{ capability_id: "higgsfield-seedance-text-video", role: "scene" }] }, new Set(["higgsfield-seedance-text-video"]));
    const route = { ...proposal, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative lunch ritual", role: "scene", settings_json: '{"prompt":"A quiet lunch ritual","duration":5}', reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true }] };
    const p = { ...plan(), variants: [{ ...asset(), style_id: "cinematic-scene", production_plan: route }] };
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [{ ...selected, video_style }], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] });
    expect(result.variants[0]!.production_plan.video_style).toEqual(video_style);
  });
  it("reworks subjective differentiation once then keeps the safe plan and its warnings", async () => {
    const p = plan();
    const picked = [selected, { ...selected, id: "n2", title: "Pack tomorrow's lunch" }, { ...selected, id: "n3", title: "A thoughtful desk break" }];
    p.variants = picked.map((n) => ({ ...asset(), angle: n.title }));
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: ["Batch differentiation remains insufficient; the endings use a common CTA."] }))
      .mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: ["The compositions could be more distinct."] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked, specs: picked.map((n) => ({ narrative: n.title, duration: 15, size: "1080x1920" })) });
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]!.production_plan.diversity_issues.length).toBeGreaterThan(0);
    expect(mocked.chat).toHaveBeenCalledTimes(4);
  });
  it("keeps unsupported claims blocking after one rework", async () => {
    mocked.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({ blocking_issues: ["The result claim has no evidence."], creative_issues: [] }))
      .mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({ blocking_issues: ["The result claim still has no evidence."], creative_issues: [] }));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] })).rejects.toThrow(/still has no evidence/);
  });
  it("explains compositor narration and valid Charon alias to the planner and reviewer", async () => {
    const p = { ...plan(), voice: "Charon" };
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }], voice: "Charon" });
    expect(result.voice).toBe("Charon");
    for (const call of mocked.chat.mock.calls) {
      expect(call[0].messages[0].content).toContain("Charon maps to onyx");
      expect(call[0].messages[0].content).toContain("Missing audioUrl in a planning proposal is not missing audio");
    }
  });
  it("rejects an unsupported Golpo voice before review", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "golpo-canvas", available: true }]);
    const p = plan();
    p.variants[0]!.production_plan = { ...proposal, steps: [{ id: "film", capability_id: "golpo-canvas", purpose: "Explain lunch", role: "finished_video", settings_json: '{"prompt":"Explain lunch","narration_voice":"Charon"}', reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true }] } as typeof proposal;
    mocked.chat.mockResolvedValue(reply(p));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] })).rejects.toThrow(/unsupported option/);
    expect(mocked.chat).toHaveBeenCalledTimes(2);
  });
  it("requires compositor assembly to preserve an explicitly chosen built-in voice", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "golpo-canvas", available: true }]);
    const p = { ...plan(), voice: "Charon" };
    p.variants[0]!.production_plan = { ...proposal, steps: [{ id: "film", capability_id: "golpo-canvas", purpose: "Explain lunch", role: "finished_video", settings_json: '{"prompt":"Explain lunch","narration_voice":"male-1"}', reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true }] } as typeof proposal;
    mocked.chat.mockResolvedValue(reply(p));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }], voice: "Charon" })).rejects.toThrow(/selected built-in narrator/);
  });
  it("also attaches owned pixels when converting a narrative into an asset", async () => {
    mocked.context.mockResolvedValue({ text: "Owned image attached.", evidence: [], recent: [], files: [{ id: fileId }], imageParts: [{ fileId, name: "product.png", dataUrl: "data:image/png;base64,AAAA" }] });
    mocked.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] });
    expect(mocked.chat.mock.calls[0]![0].messages[1].content.some((part: { type: string }) => part.type === "image_url")).toBe(true);
    expect(mocked.chat.mock.calls[1]![0].messages[1].content.some((part: { type: string }) => part.type === "image_url")).toBe(true);
  });
  it("keeps Sam's saved asset selection when the planning model proposes fewer files", async () => {
    const p = plan(); p.variants[0]!.file_ids = [];
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920", recipe_id: "branded-motion", selected_file_ids: [fileId] }], allowedFileIds: [fileId], userDirected: true });
    expect(result.variants[0]!.file_ids).toEqual([fileId]);
  });
  it("stops before inference if the compositor needed for the finished film is disconnected", async () => {
    mocked.availability.mockReturnValue([]);
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920", style_id: "brand-motion" }] })).rejects.toThrow(/compositor is not connected/);
    expect(mocked.chat).not.toHaveBeenCalled();
  });
  it("preserves exact narrative, dimensions, duration, files and chosen narrator", async () => {
    mocked.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }], voice: BUILTIN_NAMES[0]! });
    expect(result.variants[0]!.file_ids).toEqual([fileId]);
    expect(result.variants[0]!.production_plan.direction).toEqual(direction);
    expect(result.voice).toBe(BUILTIN_NAMES[0]);
  });
  it("rejects an invented file rather than dropping it silently", async () => {
    const p = plan(); p.variants[0]!.file_ids = ["22222222-2222-4222-8222-222222222222"];
    mocked.chat.mockResolvedValue(reply(p));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] })).rejects.toThrow(/outside this business/);
  });
  it("keeps the user's narrative and delivery settings when the model echoes different values", async () => {
    const p = plan(); p.variants[0]!.angle = "Abbreviated by the model"; p.variants[0]!.duration_s = 30; p.variants[0]!.size = "1920x1080";
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 15, size: "1080x1920" }] });
    expect(result.variants[0]).toMatchObject({ angle: selected.title, duration_s: 15, size: "1080x1920" });
  });
  it("supports a 60-second film through the existing compositor", async () => {
    const p = plan(); p.variants[0]!.duration_s = 60;
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 60, size: "1080x1920" }] });
    expect(result.variants[0]!.duration_s).toBe(60);
    expect(result.variants[0]!.production_plan.steps).toEqual([]);
  });
  it("does not pass a short generated clip off as a 60-second finished film", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "higgsfield-seedance-text-video", available: true }]);
    const p = { ...plan(), variants: [{ ...asset(), duration_s: 60, production_plan: { ...proposal, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative lunch ritual", role: "finished_video", settings_json: '{"prompt":"A quiet lunch ritual","duration":15}', reference_file_ids: [], reference_step_ids: [], illustrative: true }] } }] };
    mocked.chat.mockResolvedValue(reply(p));
    await expect(planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 60, size: "1080x1920" }] })).rejects.toThrow(/exact finished duration/);
  });
  it("allows a supported short generated scene inside a 60-second composed film", async () => {
    mocked.availability.mockReturnValue([{ capabilityId: "higgsfield-seedance-text-video", available: true }]);
    const p = { ...plan(), variants: [{ ...asset(), duration_s: 60, production_plan: { ...proposal, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative lunch ritual", role: "scene", settings_json: '{"prompt":"A quiet lunch ritual","duration":15}', reference_file_ids: [], reference_step_ids: [], illustrative: true }] } }] };
    mocked.chat.mockResolvedValueOnce(reply(p)).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await planProductionAssets({ admin, workspaceId: "ours", picked: [selected], specs: [{ narrative: selected.title, duration: 60, size: "1080x1920" }] });
    expect(result.variants[0]!.production_plan.steps[0]!.role).toBe("scene");
    expect(result.variants[0]!.duration_s).toBe(60);
  });
});
