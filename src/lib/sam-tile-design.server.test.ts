import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), operation: vi.fn(), context: vi.fn(), preview: vi.fn(), read: vi.fn(), mail: vi.fn(), reserve: vi.fn(), resolve: vi.fn() }));
vi.mock("./brand-dna-store.server", () => ({ pinProductionDna: vi.fn().mockResolvedValue(null), readProductionDna: vi.fn().mockResolvedValue(null), readDnaBytes: vi.fn() }));
vi.mock("./content-credits.server", () => ({ CreditAdmissionError: class CreditAdmissionError extends Error {}, getContentCreditRate: async (_db: unknown, capability: string) => ({ credits: capability === "recraft-image" ? 24 : 45, version: "rate-id" }), reserveCredits: mocks.reserve, resolveCredits: mocks.resolve }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./brand-assets.functions", () => ({ runBrandOperation: mocks.operation }));
vi.mock("./creative-context.server", () => ({ loadCreativeContext: mocks.context }));
vi.mock("./social-tile-compose.server", () => ({ composeSocialTile: mocks.preview }));
vi.mock("./social-tile-image.server", () => ({ readSocialTileImage: mocks.read }));
vi.mock("./email-layout.server", () => ({ renderEmail: () => ({ html: "alert", text: "alert" }), sendViaSendGrid: mocks.mail }));
import { createSamTile, resumeStagedSamTile } from "./sam-tile-design.server";
const input = { workspace_id: "11111111-1111-4111-8111-111111111111", request_id: "22222222-2222-4222-8222-222222222222", headline: "Test headline", supporting: "Test support", direction: "Editorial", expected_provider: "openai" as const, expected_credits: 45, expected_rate_id: "rate-id" };
describe("Sam tile creation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.reserve.mockResolvedValue("reservation"); mocks.resolve.mockResolvedValue(undefined); process.env["OPENAI_API_KEY"] = "test"; process.env["RENDER_SERVER_URL"] = "https://example.test"; process.env["RENDER_SERVER_SECRET"] = "test"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env["OPENAI_API_KEY"]; delete process.env["RECRAFT_API_KEY"]; delete process.env["IDEOGRAM_API_KEY"]; delete process.env["RENDER_SERVER_URL"]; delete process.env["RENDER_SERVER_SECRET"]; });
  it("resumes a staged image against the existing reservation without provider generation", async () => {
    const sharp = (await import("sharp")).default;
    const source = await sharp({create:{width:1000,height:1000,channels:3,background:"#ffffff"}}).png().toBuffer();
    const output = Buffer.from("composed");
    const query = (table: string) => {
      const chain = { select: () => chain, eq: () => chain, insert: () => chain,
        maybeSingle: async () => table === "brand_work_operations" ? {data:{status:"failed",result:{staged_source:true,staged_logo:false}}} :
          table === "content_credit_reservations" ? {data:{id:"old-reservation",state:"reserved"}} : {data:{id:input.request_id}} };
      return chain;
    };
    const store = {download:vi.fn(async () => ({data:{size:source.length,arrayBuffer:async()=>source},error:null})),upload:vi.fn(async () => ({error:null}))};
    mocks.admin.mockReturnValue({rpc:vi.fn().mockResolvedValue({data:true}),from:query,storage:{from:() => store}});
    mocks.preview.mockResolvedValue(output);
    mocks.operation.mockImplementation(async (_a,_w,_k,_i, task) => ({result:await task(),busy:false}));
    const provider = vi.fn();
    vi.stubGlobal("fetch",provider);
    await expect(resumeStagedSamTile("user", input)).resolves.toEqual({status:"ready",file_id:input.request_id});
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(),"old-reservation","settled");
    expect(mocks.preview).toHaveBeenCalledWith(source,undefined);
  });
  it("rejects access before any provider request", async () => {
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: false }) });
    await expect(createSamTile("user", input)).rejects.toThrow("access");
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it("rejects a changed rate before admitting or calling a provider", async () => {
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: true }) });
    await expect(createSamTile("user", { ...input, expected_rate_id: "old-rate" })).rejects.toThrow(/price changed/);
    expect(mocks.operation).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("uses owned reference pixels and preserves the original logo in the square render", async () => {
    const png = Buffer.alloc(45); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(1024,16); png.writeUInt32BE(1024,20); png[24]=8; png[25]=6; png.write("IEND",37);
    const insert = { select: () => ({ single: async () => ({ data: { id: input.request_id } }) }) };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [{ id: "logo", kind: "logo", source: "upload", size_bytes: 100 }] });
    query.update.mockReturnValue(query); query.maybeSingle.mockResolvedValue({ data: { signature: "recorded" } });
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: { allowed: true } }), storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => ({ ...query, insert: () => insert }) });
    mocks.context.mockResolvedValue({ text: "Brand evidence", imageParts: [{ fileId: "logo", name: "logo", dataUrl: "data:image/png;base64,TE9HTw==" }], files: [{ id: "logo", kind: "logo", source: "upload" }] });
    mocks.operation.mockImplementation(async (_admin, _ws, _kind, _input, task) => ({ result: await task(), busy: false }));
    mocks.preview.mockResolvedValue(Buffer.from("rendered")); mocks.read.mockResolvedValue({ file_id: input.request_id, data_url: "image" });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "image_generation_call", result: png.toString("base64") }] }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const result = await createSamTile("user", input);
    expect(result.status).toBe("ready");
    const request = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(request.model).toBe("gpt-6.1-terra");
    expect(request.tools[0]).toMatchObject({ model: "gpt-image-2.6-sunburst", quality: "max" });
    expect(request.input[0].content[1].image_url).toBe("data:image/png;base64,TE9HTw==");
    expect(mocks.preview).toHaveBeenCalledWith(png, "data:image/png;base64,TE9HTw==");
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), input.workspace_id, "user", `social-tile:${input.request_id}`, 45, "openai-image", 0, "rate-id");
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "reservation", "settled");
  });
  it("alerts only the requested admin for confirmed quota exhaustion", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), upsert: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [{ id: "logo", kind: "logo", source: "upload", size_bytes: 100 }] }); query.upsert.mockReturnValue(query); query.maybeSingle.mockResolvedValue({ data: { alert_type: "sam_tile_openai_quota" } });
    query.update.mockReturnValue(query);
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: { allowed: true } }), storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => query });
    mocks.context.mockResolvedValue({ text: "Brand", imageParts: [{ fileId: "logo", dataUrl: "data:image/png;base64,TE9HTw==" }], files: [{ id: "logo", kind: "logo", source: "upload" }] });
    mocks.operation.mockImplementation(async (_a, _w, _k, _i, task) => ({ result: await task(), busy: false }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })));
    const result = await createSamTile("user", input);
    expect(result.status).toBe("reconciliation_required");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.mail).toHaveBeenCalledOnce();
    expect(mocks.mail.mock.calls[0]![0].to).toBe("info@autosocials.com");
  });
  it("records Recraft credits before saving the finished tile", async () => {
    delete process.env["OPENAI_API_KEY"];
    process.env["RECRAFT_API_KEY"] = "test";
    const png = Buffer.alloc(45); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(1024,16); png.writeUInt32BE(1024,20); png[24]=8; png[25]=6; png.write("IEND",37);
    const updates: any[] = [];
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [{ id: "logo", kind: "logo", source: "upload", size_bytes: 100 }] });
    query.update.mockImplementation(value => { updates.push(structuredClone(value)); return query; }); query.maybeSingle.mockResolvedValue({ data: { signature: "ok" } });
    query.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: input.request_id } }) }) });
    mocks.admin.mockReturnValue({ rpc: vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: { allowed: true } }), storage: { from: () => ({ upload: async () => ({ error: null }) }) }, from: () => query });
    mocks.context.mockResolvedValue({ text: "Brand", imageParts: [{ fileId: "logo", dataUrl: "data:image/png;base64,TE9HTw==" }], files: [{ id: "logo", kind: "logo", source: "upload" }] });
    mocks.operation.mockImplementation(async (_a, _w, _k, _i, task) => ({ result: await task(), busy: false })); mocks.preview.mockResolvedValue(Buffer.from("rendered")); mocks.read.mockResolvedValue({ file_id: input.request_id });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ credits: 40, data: [{ b64_json: png.toString("base64") }] }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const result = await createSamTile("user", { ...input, direction: "abstract illustration", expected_provider: "recraft", expected_credits: 24 });
    expect(result.status).toBe("ready"); expect(fetcher).toHaveBeenCalledOnce();
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), input.workspace_id, "user", `social-tile:${input.request_id}`, 24, "recraft-image", 0, "rate-id");
    expect(updates.some(entry => entry.result.provider === "recraft" && entry.result.credits === 40)).toBe(true);
  });
});
