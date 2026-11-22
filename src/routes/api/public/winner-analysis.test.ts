import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWinnerAnalysis } from "./winner-analysis";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), account: vi.fn(), secret: vi.fn() }));
vi.mock("@/lib/supabase-admin.server", () => ({ getAdminClient: () => ({ from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: table === "internal_job_secrets" ? mocks.secret : mocks.account }) }) }) }) }));
vi.mock("@/lib/winner-analysis.server", () => ({ generateWinnerFindings: mocks.generate }));

describe("winner analysis scheduler endpoint", () => {
  const secret = "a".repeat(64);
  const accountId = "00000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secret.mockResolvedValue({ data: { secret }, error: null });
    mocks.account.mockResolvedValue({ data: { workspace_id: "workspace-from-account", status: "connected", is_enabled: true }, error: null });
    mocks.generate.mockResolvedValue({ generated: 1 });
  });
  const request = (provided: string, body = { account_id: accountId, workspace_id: "attacker-workspace" }) => new Request("https://example.com/", { method: "POST", headers: { "x-winner-job-secret": provided, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("rejects missing or incorrect scheduler credentials", async () => {
    expect((await handleWinnerAnalysis(request("bad"))).status).toBe(401);
    expect((await handleWinnerAnalysis(request("b".repeat(64)))).status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("derives the workspace from the connected account, not the request", async () => {
    expect((await handleWinnerAnalysis(request(secret))).status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), "workspace-from-account");
  });
  it("does not analyse a disconnected account", async () => {
    mocks.account.mockResolvedValue({ data: { workspace_id: "workspace", status: "disconnected", is_enabled: false }, error: null });
    expect((await handleWinnerAnalysis(request(secret))).status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
