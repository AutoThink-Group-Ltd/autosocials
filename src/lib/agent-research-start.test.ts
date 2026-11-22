import { describe, it, expect, vi } from "vitest";
import {
  agentResearchAction,
  AgentResearchError,
} from "./agent-research.server";
const workspace = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333",
  connection = "44444444-4444-4444-8444-444444444444";
function fixture() {
  let saved: any = null,
    conflict = false;
  const start = vi.fn(async () => "internal-provider-id");
  const handoff = vi.fn();
  const db: any = {
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      let op = "select",
        payload: any,
        query: any = {};
      query.select = () => query;
      query.eq = () => query;
      query.insert = (v: any) => {
        op = "insert";
        payload = v;
        return query;
      };
      query.update = (v: any) => {
        op = "update";
        payload = v;
        return query;
      };
      query.maybeSingle = async () =>
        table === "agent_api_connections"
          ? {
              data: {
                id: connection,
                workspace_id: workspace,
                user_id: user,
                scopes: ["research:run"],
                expires_at: "2099-01-01T00:00:00Z",
                revoked_at: null,
              },
              error: null,
            }
          : { data: saved, error: null };
      query.single = async () => {
        if (conflict) return { data: null, error: { code: "23505" } };
        saved = {
          id,
          status: "queued",
          agent_request_hash: payload.agent_request_hash,
        };
        return { data: { id, status: "queued" }, error: null };
      };
      query.then = (resolve: any, reject: any) => {
        if (op === "update" && saved) saved.status = payload.status;
        return Promise.resolve({ error: null }).then(resolve, reject);
      };
      return query;
    },
  };
  const deps = {
    db,
    discover: vi.fn(),
    configured: () => true,
    start,
    handoff,
  };
  return {
    deps,
    start,
    handoff,
    setConflict: () => {
      conflict = true;
    },
  };
}
const request = (query = "Example") => ({
  action: "start" as const,
  workspaceId: workspace,
  userId: user,
  connectionId: connection,
  idempotencyKey: "once",
  input: {
    query,
    question: "",
    targets: ["https://www.instagram.com/example"],
    allowMeteredRun: true,
  },
});
describe("agent research start", () => {
  it("requires explicit paid-run consent before creating a provider run", async () => {
    const f = fixture();
    await expect(
      agentResearchAction(
        { ...request(), input: { ...request().input, allowMeteredRun: false } },
        f.deps,
      ),
    ).rejects.toThrow();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("starts once and replays without calling provider, rejects changed input", async () => {
    const f = fixture();
    const first = await agentResearchAction(request(), f.deps);
    const again = await agentResearchAction(request(), f.deps);
    expect(first).toEqual({ id, status: "fetching", reused: false });
    expect(again).toEqual({ id, status: "fetching", reused: true });
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.handoff).toHaveBeenCalledTimes(1);
    await expect(
      agentResearchAction(request("Changed"), f.deps),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    expect(f.start).toHaveBeenCalledTimes(1);
  });
  it("rejects unrelated active runs without calling providers", async () => {
    const f = fixture();
    f.setConflict();
    await expect(agentResearchAction(request(), f.deps)).rejects.toMatchObject({
      status: 409,
      code: "research_active",
    });
    expect(f.start).not.toHaveBeenCalled();
  });
  it("does not turn a post URL into a target profile", async () => {
    const f = fixture();
    await expect(
      agentResearchAction(
        {
          ...request(),
          input: {
            ...request().input,
            targets: ["https://www.instagram.com/example/p/123"],
          },
        },
        f.deps,
      ),
    ).rejects.toBeInstanceOf(AgentResearchError);
    expect(f.start).not.toHaveBeenCalled();
  });
});
