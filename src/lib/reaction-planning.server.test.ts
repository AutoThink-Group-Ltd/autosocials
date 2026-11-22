import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ chat: vi.fn(), context: vi.fn() }));
vi.mock("./dossier.server", () => ({ aiChat: mocks.chat }));
vi.mock("./creative-context.server", () => ({ loadCreativeContext: mocks.context }));
vi.mock("./creative-providers/adapters.server", () => ({
  getCreativeProviderAvailability: () => [{ capabilityId: "heygen-avatar", available: true }, { capabilityId: "autotoast-hyperframes", available: true }],
  listCreativeProviderPresets: vi.fn(),
}));
vi.mock("./playbook.server", () => ({ HOUSE_RULES: "Preserve facts", CREATIVE_PLAYBOOK: "Follow the user direction" }));
import { planProductionAssets } from "./creative-planning.server";
import { CREATIVE_DIRECTION_SCHEMA } from "./creative-direction";

const demoId = "33333333-3333-4333-8333-333333333333";
const direction = Object.fromEntries(Object.keys(CREATIVE_DIRECTION_SCHEMA.properties).map((key) => [key, `Specific ${key}`]));
const picked = { id: "request", title: "App walkthrough", message: "Show the real app", why: "User direction", selected: true };
const spec = { narrative: picked.title, duration: 30 as const, size: "1080x1920", style_id: "reaction-ugc" as const, model_choice: "user" as const, recipe_id: "reaction-demo", selected_file_ids: [demoId], delivery: { mode: "assembled_ad" as const } };
const reply = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
const proposal = () => ({ title: "App story", audience: "App users", offer: "", voice: "Kore", voice_reason: "Clear voice", variants: [{ day: 1, angle: picked.title, argument: "A real demonstration", hook: "See this", format: "Reaction demo", duration_s: 30, size: "1080x1920", beats: ["Reaction", "Demonstration"], voiceover: "Let me show you how this app works.", script: "A presenter appears next to the app recording.", caption: "See the app", cta: "Explore", file_ids: [demoId], style_id: "reaction-ugc", production_plan: { direction, assumptions: [], steps: [] } }] });
const call = () => planProductionAssets({ admin: {} as never, workspaceId: "ours", picked: [picked], specs: [spec], allowedFileIds: [demoId], userDirected: true });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ text: "An app demonstration", files: [{ id: demoId, name: "App demo.mp4", kind: "video", mime: "video/mp4" }], recent: [], evidence: [], imageParts: [] });
});

describe("reaction demo planning", () => {
  it("uses a deterministic HeyGen presenter while retaining the demo only for composition", async () => {
    mocks.chat.mockResolvedValueOnce(reply(proposal())).mockResolvedValueOnce(reply({ blocking_issues: [], creative_issues: [] }));
    const result = await call();
    const variant = result.variants[0]!;
    expect(variant.file_ids).toEqual([demoId]);
    expect(variant.production_plan.steps).toHaveLength(1);
    expect(variant.production_plan.steps[0]).toMatchObject({ capability_id: "heygen-avatar", role: "scene", reference_file_ids: [], reference_step_ids: [], reference_roles: [], settings: { avatar_id: "Daphne_public_4", duration: 30 } });
    expect(JSON.stringify(variant.production_plan.steps)).not.toContain("higgsfield");
    expect(JSON.stringify(variant.production_plan.steps)).not.toContain(demoId);
  });
  it("rejects a selected screenshot when no demonstration video is available", async () => {
    mocks.context.mockResolvedValue({ text: "An app screenshot", files: [{ id: demoId, name: "Screenshot.png", kind: "image", mime: "image/png" }], recent: [], evidence: [], imageParts: [] });
    mocks.chat.mockResolvedValue(reply(proposal()));
    await expect(call()).rejects.toThrow("Choose an owned demonstration video before planning");
  });
});
