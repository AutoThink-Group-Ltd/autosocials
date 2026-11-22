import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ chat: vi.fn(), context: vi.fn(), social: vi.fn() }));
vi.mock("../lib/dossier.server", () => ({ aiChat: mocks.chat }));
vi.mock("../lib/creative-context.server", () => ({ loadCreativeContext: mocks.context }));
vi.mock("../lib/sam-social-evidence.server", () => ({ loadSamSocialEvidence: mocks.social }));
vi.mock("../lib/playbook.server", () => ({ HOUSE_RULES: "Use verified evidence", CREATIVE_PLAYBOOK: "Use verified evidence" }));
import { proposeNarratives } from "../lib/creative-planning.server";
import { IdeationStopped } from "../lib/ideation-control.server";
let active: boolean;
const assertActive = async () => { if (!active) throw new IdeationStopped(); };
const run = () => proposeNarratives({ admin: {} as any, userId: "user", workspaceId: "workspace", existing: [], count: 1, assertActive });
beforeEach(() => { vi.clearAllMocks(); active = true; mocks.context.mockResolvedValue({ text: "Verified local brand", evidence: [], recent: [], website: null, files: [] }); mocks.social.mockResolvedValue("Public source evidence"); });
describe("ideation phase cancellation", () => {
  it("does not start evidence or inference after cancellation", async () => {
    active = false;
    await expect(run()).rejects.toBeInstanceOf(IdeationStopped);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.social).not.toHaveBeenCalled(); expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("does not start model drafting when cancellation arrives during evidence loading", async () => {
    mocks.social.mockImplementation(async () => { active = false; return "Evidence returned after Stop"; });
    await expect(run()).rejects.toBeInstanceOf(IdeationStopped);
    expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("discards in-flight drafting and does not start critique", async () => {
    mocks.chat.mockImplementation(async () => { active = false; return { choices: [{ message: { content: JSON.stringify({ narratives: [] }) } }] }; });
    await expect(run()).rejects.toBeInstanceOf(IdeationStopped);
    expect(mocks.chat).toHaveBeenCalledTimes(1);
  });
  it("does not turn an in-flight failure after Stop into a model retry", async () => {
    mocks.chat.mockImplementation(async () => { active = false; throw new Error("Provider call ended"); });
    await expect(run()).rejects.toBeInstanceOf(IdeationStopped);
    expect(mocks.chat).toHaveBeenCalledTimes(1);
  });
});
