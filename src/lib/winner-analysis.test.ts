import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWinnerFindings } from "./winner-analysis.server";

const mocks = vi.hoisted(() => ({ chat: vi.fn(), thumbnail: vi.fn() }));
vi.mock("./dossier.server", () => ({ aiChat: mocks.chat }));
vi.mock("./winner-thumbnail.server", () => ({ inspectableWinnerThumbnail: mocks.thumbnail }));

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
function fakeDatabase() {
  const writes: any[] = [];
  const rows = ids.map((id, i) => ({ id, account_id: "account", platform: "instagram", format: "video", caption: `Caption ${i}`, thumbnail_url: null, published_at: new Date(Date.now() - 4 * 86400000).toISOString(), measured_at: new Date().toISOString(), likes: i + 1, comments_count: 0, shares: null, comments: [{ text: "private comment text" }] }));
  const rpc = vi.fn(async (name: string, args: any) => { if (name === "replace_winner_findings") writes.push(args); return { data: name === "claim_winner_analysis" ? "lease" : null, error: null }; });
  const db = { rpc, from(table: string) {
    const chain: any = { select: () => chain, eq: () => chain, not: () => chain, order: () => chain,
      limit: async () => ({ data: table === "winner_posts" ? rows : [], error: null }),
      update: () => chain, lt: async () => ({ error: null }),
      upsert: async (value: unknown) => { writes.push(value); return { error: null }; } };
    return chain;
  } };
  return { db: db as any, writes, rpc };
}

describe("performance learning", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.thumbnail.mockResolvedValue(null); });
  it("stores only scoped evidence metadata and releases the analysis lease", async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ findings: [{ title: "Questions in hooks", explanation: "A hypothesis to test.", post_ids: ids.slice(0, 2), basis: "text" }] }) } }] }).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reviews: [{ index: 1, valid: true }] }) } }] });
    const { db, writes, rpc } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 1 });
    expect(writes[0]).toMatchObject({ _workspace_id: "workspace-a", _findings: [{ source_post_ids: ids.slice(0, 2) }] });
    expect(JSON.stringify(writes)).not.toContain("private comment text");
    expect(rpc).toHaveBeenCalledWith("finish_winner_analysis", { _workspace_id: "workspace-a", _token: "lease", _succeeded: true });
  });
  it("discards invented evidence IDs without saving them", async () => {
    mocks.chat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ findings: [{ title: "Pattern", explanation: "Maybe.", post_ids: [ids[0], "00000000-0000-4000-8000-000000000099"], basis: "text" }] }) } }] });
    const { db, writes, rpc } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 0 });
    expect(writes[0]._findings).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("finish_winner_analysis", { _workspace_id: "workspace-a", _token: "lease", _succeeded: true });
  });
  it("rejects visual claims if thumbnails were not actually inspected", async () => {
    mocks.chat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ findings: [{ title: "Visual pattern", explanation: "Maybe.", post_ids: ids.slice(0, 2), basis: "thumbnail" }] }) } }] });
    const { db, writes } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 0 });
    expect(writes[0]._findings).toEqual([]);
  });
  it("rejects an explanation mentioning an uncited post", async () => {
    mocks.chat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ findings: [{ title: "Pattern", explanation: `Compare ${ids[2]}`, post_ids: ids.slice(0, 2), basis: "text" }] }) } }] });
    const { db, writes } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 0 });
    expect(writes[0]._findings).toEqual([]);
  });
  it("does not save a finding rejected by the evidence review", async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ findings: [{ title: "Pattern", explanation: "Maybe.", post_ids: ids.slice(0, 2), basis: "text" }] }) } }] }).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reviews: [{ index: 1, valid: false }] }) } }] });
    const { db, writes } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 0 });
    expect(writes[0]._findings).toEqual([]);
  });
  it("keeps valid candidates when another candidate cites an unknown post", async () => {
    mocks.chat.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ findings: [
      { title: "Unknown", explanation: "Maybe.", post_ids: [ids[0], "00000000-0000-4000-8000-000000000099"], basis: "text" },
      { title: "Supported", explanation: "A hypothesis to test.", post_ids: ids.slice(0, 2), basis: "text" },
    ] }) } }] }).mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reviews: [{ index: 1, valid: true }] }) } }] });
    const { db, writes } = fakeDatabase();
    expect(await generateWinnerFindings(db, "workspace-a")).toEqual({ generated: 1 });
    expect(writes[0]._findings).toHaveLength(1);
    expect(writes[0]._findings[0].title).toBe("Supported");
  });
});
