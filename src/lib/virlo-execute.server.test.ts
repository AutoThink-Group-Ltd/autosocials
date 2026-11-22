import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), call: vi.fn() }));
vi.mock("./virlo-db.server", () => ({ virloDb: () => ({ from: mocks.from }) }));
vi.mock("./virlo.server", () => ({ virloAvailable: () => true, callVirlo: mocks.call, VirloError: class extends Error {} }));
import { executeVirloOperation, virloResourceId } from "./virlo-execute.server";
const workspace = "11111111-1111-4111-8111-111111111111";
const resource = "22222222-2222-4222-8222-222222222222";
const request = "33333333-3333-4333-8333-333333333333";
beforeEach(() => { vi.clearAllMocks(); });
describe("Sam Virlo execution safeguards", () => {
  it("keeps the research agent ID distinct from its run job ID", () => {
    expect(virloResourceId("research_start", { id: "agent", job_id: "job" })).toBe("agent");
    expect(virloResourceId("creator_lookup", { id: "creator", job_id: "job" })).toBe("job");
  });
  it("rejects irreversible agent deletion before user confirmation", async () => {
    await expect(executeVirloOperation({ workspace_id: workspace, request_id: request, operation: { operation: "research_delete", id: resource } }, "user")).rejects.toThrow(/irreversible/);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("rejects recurring tracking before a provider call without confirmation", async () => {
    await expect(executeVirloOperation({ workspace_id: workspace, request_id: request, operation: { operation: "track_creator", handle: "creator", platform: "tiktok", cadence: "weekly" } }, "user")).rejects.toThrow(/Confirm/);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("rejects an agent search when the agent is not owned by this workspace", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    await expect(executeVirloOperation({ workspace_id: workspace, request_id: request, operation: { operation: "videos", scope: "agent", agent_id: resource, query: "skincare" } }, "user")).rejects.toThrow(/not available in this workspace/);
    expect(query.eq).toHaveBeenCalledWith("workspace_id", workspace);
    expect(query.eq).toHaveBeenCalledWith("provider_id", resource);
    expect(query.eq).toHaveBeenCalledWith("kind", "research");
    expect(mocks.call).not.toHaveBeenCalled();
  });
});
