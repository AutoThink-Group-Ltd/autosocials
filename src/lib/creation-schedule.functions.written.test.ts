import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  resolvePrimaryRender: vi.fn(),
  prepareCarouselDraft: vi.fn(),
  listTrash: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({ inputValidator: (validate: (value: unknown) => unknown) => ({
    handler: (handler: (value: { data: unknown }) => unknown) => (args: { data: unknown }) => handler({ data: validate(args.data) }),
  }) }),
}));
vi.mock("./supabase-admin.server", () => ({
  requireUser: mocks.requireUser,
  getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from, storage: { from: () => ({ list: mocks.listTrash }) } }),
}));
vi.mock("./carousel-schedule.server", () => ({ prepareCarouselDraft: mocks.prepareCarouselDraft }));
vi.mock("./asset-versions.server", () => ({ resolvePrimaryRender: mocks.resolvePrimaryRender }));
vi.mock("./dossier.server", () => ({ aiChat: vi.fn(), loadDossierContext: vi.fn() }));
vi.mock("./schedule-caption-model", () => ({ writeScheduleCaptions: vi.fn() }));

import { suggestPostingCadence, prepareCreationSchedule, scheduleCreations } from "./creation-schedule.functions";

const workspace = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const post = "33333333-3333-4333-8333-333333333333";
const request = "44444444-4444-4444-8444-444444444444";
const account = "55555555-5555-4555-8555-555555555555";
const original = "Attribution models hide uncertainty.";
const payload = {
  workspace_id: workspace, request_id: request, confirmed: true as const, account_ids: [account],
  items: [{ type: "written" as const, id: post, source_caption: original, captions: { linkedin: original }, account_ids: [account], scheduled_at: "2030-01-01T10:00:00.000Z", immediate: false }],
};

describe("written creation scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: user });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "can_confirm_creation_schedule") return { data: true, error: null };
      if (name === "has_creation_schedule_receipt") return { data: false, error: null };
      return { data: null, error: null };
    });
    mocks.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === "workspaces" ? { requires_approval: false } : null, error: null }),
      };
      return chain;
    });
  });

  it("sends text-only content to the atomic written RPC without resolving a video", async () => {
    const result = await (scheduleCreations as unknown as (args: { data: typeof payload }) => Promise<{ scheduled: { type: string; id: string }[]; failures: unknown[] }>)({ data: payload });
    expect(result.failures).toEqual([]);
    expect(result.scheduled).toEqual([expect.objectContaining({ type: "written", id: post })]);
    expect(mocks.resolvePrimaryRender).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("commit_creation_schedule_item_v5", expect.objectContaining({
      _workspace_id: workspace, _user_id: user, _written_id: post, _written_caption: original,
      _source: `written_post:${post}`, _variant_id: null, _render_id: null, _captions: { linkedin: original },
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith("commit_creation_schedule_item_v3", expect.anything());
  });

  it("commits the PDF snapshot through the existing atomic scheduler", async () => {
    const revision = "a".repeat(64);
    mocks.listTrash.mockResolvedValue({ data: [], error: null });
    mocks.prepareCarouselDraft.mockResolvedValue("workspace/creation-schedules/post/carousel.pdf");
    const result = await scheduleCreations({
      data: { ...payload, items: [{ type: "carousel", id: post, revision, captions: { linkedin: original },
        account_ids: [account], scheduled_at: payload.items[0]!.scheduled_at }] },
    });
    expect(result.failures).toEqual([]);
    expect(mocks.prepareCarouselDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      revision, workspaceId: workspace, id: post, caption: original,
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("commit_creation_schedule_item_v6", expect.objectContaining({
      _source: `linkedin_carousel:${post}`, _media_path: "workspace/creation-schedules/post/carousel.pdf",
      _account_ids: [account], _variant_id: null,
    }));
  });

  it("does not schedule when workspace access is denied", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "can_confirm_creation_schedule" ? { data: false, error: null } : { data: null, error: null });
    await expect((scheduleCreations as unknown as (args: { data: typeof payload }) => Promise<unknown>)({ data: payload })).rejects.toThrow("Workspace access denied");
    expect(mocks.rpc).not.toHaveBeenCalledWith("commit_creation_schedule_item_v5", expect.anything());
  });
});


it("prepares a directly published written post using its own text without AI", async () => {
  mocks.requireUser.mockResolvedValue({ id: user });
  mocks.rpc.mockImplementation(async (name: string) => name === "can_access_workspace" ? { data: true, error: null } : { data: null, error: null });
  mocks.from.mockImplementation((table: string) => {
    const chain = { select: () => chain, eq: () => chain, in: async () => ({data:[{id:account,platform:"linkedin",is_enabled:true,status:"connected",expires_at:null}],error:null}), maybeSingle: async () => ({data:table === "posts" ? {id:post,caption:original,status:"published",created_via:"written_posts",variant_id:null,post_media:[]} : null,error:null}) }; return chain;
  });
  const result = await (prepareCreationSchedule as unknown as (args: {data:unknown}) => Promise<{items:{id:string;source_caption:string;captions:Record<string,string>}[]}>)({data:{workspace_id:workspace,creations:[{type:"written",id:post}],account_ids:[account],first_at:"2031-01-01T10:00:00.000Z",timezone:"Europe/London"}});
  expect(result.items[0]).toMatchObject({id:post,source_caption:original,captions:{linkedin:original + "\n\n#Attribution #Models"}});
  expect(mocks.resolvePrimaryRender).not.toHaveBeenCalled();
});

it("refuses a scheduled copy as a new source to prevent losing original lineage", async () => {
  mocks.requireUser.mockResolvedValue({id:user}); mocks.rpc.mockResolvedValue({data:true,error:null});
  mocks.from.mockImplementation((table:string) => {const chain = {select:()=>chain,eq:()=>chain,in:async()=>({data:[{id:account,platform:"linkedin",is_enabled:true,status:"connected",expires_at:null}],error:null}),maybeSingle:async()=>({data:table === "posts" ? {id:post,caption:original,status:"published",created_via:`written_post:${post}`,variant_id:null,post_media:[]} : null,error:null})};return chain;});
  await expect((prepareCreationSchedule as unknown as (args:{data:unknown})=>Promise<unknown>)({data:{workspace_id:workspace,creations:[{type:"written",id:post}],account_ids:[account],first_at:"2031-01-01T10:00:00.000Z",timezone:"Europe/London"}})).rejects.toThrow("unavailable or contains media");
});

it("prepares all twelve approved LinkedIn tiles in order without asking the caption writer", async () => {
  const ids = Array.from({ length: 12 }, () => crypto.randomUUID());
  const posts = ids.map((_, i) => ({ caption: `Customer retention experiment ${i + 1}`, platform: "linkedin" }));
  mocks.requireUser.mockResolvedValue({ id: user });
  mocks.rpc.mockResolvedValue({ data: true });
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, string> = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => { filters[column] = value; return chain; },
      maybeSingle: async () => ({ data: { id: filters.id, name: "Artwork", mime: "image/png" } }),
      in: async () => {
        if (table === "social_accounts") return { data: [{ id: account, platform: "linkedin", is_enabled: true, status: "connected" }] };
        if (filters.kind === "personal-idea-tile-quote") return { data: ids.map((id, index) => ({ signature: id, result: { request_id: id, batch_id: request, index } })) };
        if (filters.kind === "content-campaign-quote") return { data: [{ signature: request, result: { quote: { batch_id: request, posts } } }] };
        return { data: [] };
      },
    };
    return chain;
  });
  const first = "2031-11-19T09:00:00.000Z";
  const result = await prepareCreationSchedule({ data: { workspace_id: workspace, account_ids: [account], first_at: first, timezone: "UTC", creations: ids.map(id => ({ id, type: "tile" as const })) } });
  expect(result.items.map(item => [item.id, item.captions.linkedin, item.scheduled_at])).toEqual(
    ids.map((id, i) => [id, posts[i]!.caption + "\n\n#Customer #Retention", new Date(Date.parse(first) + i * 86400000).toISOString()]),
  );
  expect((await import("./schedule-caption-model")).writeScheduleCaptions).not.toHaveBeenCalled();
});

it("uses AI spacing only when requested and rejects unordered dates", async () => {
  mocks.requireUser.mockResolvedValue({ id: user });
  mocks.rpc.mockResolvedValue({ data: true });
  const writer = vi.mocked((await import("./schedule-caption-model")).writeScheduleCaptions);
  const input = { data: { workspace_id: workspace, first_at: "2031-11-19T09:00:00.000Z", timezone: "UTC", titles: ["First", "Second"], channels: ["linkedin" as const] } };
  for (const hours of [[0, 48], [0, 0]]) {
    writer.mockResolvedValueOnce({ fallback: false, response: { choices: [{ message: { content: JSON.stringify({ hours }) } }] } });
    if (hours[1]) expect(await suggestPostingCadence(input)).toEqual([input.data.first_at, "2031-11-21T09:00:00.000Z"]);
    else await expect(suggestPostingCadence(input)).rejects.toThrow("could not suggest dates");
  }
});
