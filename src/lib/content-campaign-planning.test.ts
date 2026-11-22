import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), insert: vi.fn(), read: vi.fn(), update: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({
  getAdminClient: () => ({
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      const result = table === "workspaces" ? { timezone: "Europe/London", social_profiles: [] }
        : table === "dossier_documents" ? { content: "Win enterprise work" }
        : table === "brand_work_operations" ? null : null;
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        single: async () => ({ data: result, error: null }), maybeSingle: async () => ({ data: result, error: null }) };
      return query;
    },
  }),
}));
vi.mock("./creative-context.server", () => ({ loadCreativeContext: async () => ({ text: "approved brand facts", evidence: [{name:"Brand assets",status:"read"}] }) }));
vi.mock("./dossier.server", () => ({ aiChat: mocks.ai }));
vi.mock("./content-campaign.server", () => ({ insertContentCampaign: mocks.insert, readContentCampaign: mocks.read, updateContentCampaign: mocks.update }));
import { planContentCampaign, reviseContentCampaign } from "./content-campaign-plan.server";
const uuid = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockImplementation(async (_u, _w, campaign) => campaign);
  mocks.ai.mockImplementation(async (input: {messages: {content:string}[]}) => {
    const body = JSON.parse(input.messages[1]!.content);
    return { choices: [{message:{content:JSON.stringify({posts:body.dates.map((date:string) => ({date,platform:"linkedin",format:"tiles",title:"Title " + date,caption:"Caption",brief:"Tile"}))})}}] };
  });
});
it("uses saved goals and brand context while producing the full original November range in batches", async () => {
  const campaign = await planContentCampaign(uuid, uuid, uuid, "LinkedIn posts for the rest of the month with a social tile", 5, "2026-11-18T12:00:00Z");
  expect(campaign.posts).toHaveLength(12);
  expect(campaign.title).toMatch(/19.*30 Nov/);
  expect(campaign.posts[0]?.date).toBe("2026-11-19");
  expect(campaign.posts[11]?.date).toBe("2026-11-30");
  expect(campaign.posts.every(post => post.format === "tiles")).toBe(true);
  expect(mocks.ai).toHaveBeenCalledTimes(2);
  const body = JSON.parse(mocks.ai.mock.calls[0]![0].messages[1].content);
  expect(body.goals).toBe("Win enterprise work");
  expect(body.context).toBe("approved brand facts");
});
it("revises using the loaded version and refuses fabricated post identities", async () => {
  const post = { id:uuid, date:"2026-11-19", platform:"linkedin",format:"tiles",title:"Title",caption:"Original",brief:"Tile" };
  mocks.read.mockResolvedValue({ id:uuid, revision:uuid, posts:[post] });
  mocks.ai.mockResolvedValue({choices:[{message:{content:JSON.stringify({posts:[{...post,caption:"Changed"}]})}}]});
  await reviseContentCampaign(uuid,uuid,uuid,"Make it sharper");
  expect(mocks.update).toHaveBeenCalledWith(uuid,uuid,uuid,uuid,[{...post,caption:"Changed"}]);
  mocks.ai.mockResolvedValue({choices:[{message:{content:JSON.stringify({posts:[{...post,id:"22222222-2222-4222-8222-222222222222"}]})}}]});
  await expect(reviseContentCampaign(uuid,uuid,uuid,"Change it")).rejects.toThrow("unknown or duplicate");
});
