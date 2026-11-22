import { describe, expect, it, vi } from "vitest";
const privileged = vi.hoisted(() => ({ current: null as any }));
const cancellation = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/supabase-admin.server", () => ({ getAdminClient: () => privileged.current }));
vi.mock("@/lib/creative-providers/adapters.server", async importOriginal => ({...await importOriginal<typeof import("@/lib/creative-providers/adapters.server")>(), cancelCreativeProviderJob: cancellation.call}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain: any = {middleware: () => chain, inputValidator: () => chain, handler: (fn: any) => fn}; return chain; } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { assertNoUncertainGeneration, beginStep, failStep, listRenderSteps, previousGenerationStep, updateStep } from "@/lib/generation-tracker.server";
import { cancelGenerationStep, generationCapabilities, generationPreview, generationStepPreview, listGenerationSteps } from "@/lib/generation-tracker.functions";
import { CreativeProviderError } from "@/lib/creative-providers/adapters.server";
import { formatGenerationCost, safeStoragePath, sanitizeGenerationSettings, sanitizeUsage } from "@/lib/generation-tracker";

const input = { renderJobId: "job", workspaceId: "workspace", variantId: "variant", userId: "user", initiator: "sam" as const, stepKey: "scene-1", provider: "fal", model: "exact-model", operation: "image" };
describe("generation tracker authorization", () => {
  it("does not infer historical completion speed from last-updated timestamps", async () => {
    privileged.current = { rpc: async () => ({ data: { avg_elapsed_seconds: 200000, breakdown: [{ provider: "legacy_unknown", avg_elapsed_seconds: 300000 }, { provider: "higgsfield", avg_elapsed_seconds: 42 }] } }) };
    const chain: any = { order: () => chain, range: async () => ({ data: [], count: 0 }) };
    const result = await (listGenerationSteps as any)({ data: { page: 0 }, context: { userId: "admin", supabase: { rpc: async () => ({ data: true }), from: () => ({ select: () => chain }) } } });
    expect(result.stats.avg_elapsed_seconds).toBeNull();
    expect(result.stats.breakdown[0].avg_elapsed_seconds).toBeNull();
    expect(result.stats.breakdown[1].avg_elapsed_seconds).toBe(42);
  });
  it("rejects normal users before any ledger query or privileged preview access", async () => {
    const from = vi.fn();
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const request = { data: { page: 0, renderJobId: "job" }, context: { userId: "user", supabase: {rpc,from} } };
    await expect((listGenerationSteps as any)(request)).rejects.toThrow("Forbidden");
    await expect((generationPreview as any)(request)).rejects.toThrow("Forbidden");
    await expect((generationCapabilities as any)(request)).rejects.toThrow("Forbidden");
    await expect((cancelGenerationStep as any)(request)).rejects.toThrow("Forbidden");
    await expect((generationStepPreview as any)(request)).rejects.toThrow("Forbidden");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "user", _role: "super_admin" });
  });
  it("sends exact model/operation filters to full-history aggregates and uses privileged bounded context reads after role verification", async () => {
    const sequence: string[] = [];
    const aggregate = vi.fn(async () => {sequence.push("aggregate");return {data:{total:101,successful_videos:4,costs:[],breakdown:[]}};});
    const reads = vi.fn((table: string) => ({select: () => ({in: async () => ({data: table === "workspaces" ? [{id:"workspace",name:"Example brand"}] : [{id:"render",brief_snapshot:{hook:"A bounded brief",raw_provider_payload:"must not return"}}]})})}));
    privileged.current = {rpc:aggregate,from:reads};
    const chain: any = {eq: vi.fn(() => chain),order: () => chain,range: async () => ({data:[{render_job_id:"render",workspace_id:"workspace"}],count:101})};
    const from = vi.fn(() => ({select: () => chain}));
    const rpc = vi.fn(async () => {sequence.push("role");return {data:true};});
    const result = await (listGenerationSteps as any)({data:{page:1,model:"provider/exact-model",operation:"video",provider:"higgsfield"},context:{userId:"admin",supabase:{rpc,from}}});
    expect(sequence[0]).toBe("role");
    expect(aggregate).toHaveBeenCalledWith("generation_tracker_stats",expect.objectContaining({p_model:"provider/exact-model",p_operation:"video",p_provider:"higgsfield"}));
    expect(chain.eq).toHaveBeenCalledWith("model","provider/exact-model");
    expect(result.total).toBe(101);
    expect(result.workspaces).toEqual({workspace:"Example brand"});
    expect(result.briefs).toEqual({render:"A bounded brief"});
    expect(JSON.stringify(result)).not.toContain("raw_provider_payload");
  });
});
function cancellationFixture(overrides: Record<string, unknown> = {}, claimed = true) {
  const leaf = { id:"leaf", render_job_id:"render",workspace_id:"workspace",variant_id:"variant",provider:"higgsfield",provider_job_id:"request-1",status:"running",step_key:"provider:scene1",model:"bytedance/seedance-2.0/text-to-video", ...overrides };
  const render = {id:"render",brief_snapshot:{production_plan:{steps:[{id:"scene1",capability_id:"higgsfield-seedance-text-video"}]}}};
  const writes: Array<{table:string;patch:any;filters:any[]}> = [];
  const from = (table: string) => {
    const builder = (patch: any = null) => {
      const filters: any[] = [];
      const chain: any = {select: () => chain,eq: (k: string,v: unknown) => {filters.push([k,v]);return chain;},is: (k: string,v: unknown) => {filters.push([k,v]);return chain;},
        single: async () => ({data:table === "generation_steps" ? leaf : render}),
        maybeSingle: async () => {if(patch) writes.push({table,patch,filters});return {data:claimed ? {id:"render"} : null};},
        then: (resolve: (value: unknown) => void) => {if(patch)writes.push({table,patch,filters});resolve({error:null});},
      };return chain;
    };return {select: () => builder(),update: (patch: any) => builder(patch)};
  };
  privileged.current = {from};
  cancellation.call.mockReset();
  const request = {data:{stepId:"leaf",confirmed:true},context:{userId:"admin",supabase:{rpc:async()=>({data:true})}}};
  return {leaf,render,writes,request};
}
describe("explicit provider cancellation", () => {
  it("requires confirmation, a known active supported provider job and a frozen matching capability", async () => {
    const missingConfirmation = cancellationFixture();
    await expect((cancelGenerationStep as any)({...missingConfirmation.request,data:{stepId:"leaf",confirmed:false}})).rejects.toThrow("Explicit cancellation confirmation");
    for (const [overrides, message] of [[{provider:"golpo"},"no supported cancellation"],[{provider_job_id:null},"No confirmed provider job ID"],[{status:"reconciliation_required"},"Only an active"],[{model:"wrong-model"},"does not match"]] as const) {
      const fixture = cancellationFixture(overrides);
      await expect((cancelGenerationStep as any)(fixture.request)).rejects.toThrow(message);
      expect(cancellation.call).not.toHaveBeenCalled();
      expect(fixture.writes).toHaveLength(0);
    }
    const missingPlan = cancellationFixture();missingPlan.render.brief_snapshot.production_plan.steps = [];
    await expect((cancelGenerationStep as any)(missingPlan.request)).rejects.toThrow("frozen production plan");
    expect(cancellation.call).not.toHaveBeenCalled();
  });
  it("does not contact the provider when a poll already owns the render phase", async () => {
    const fixture = cancellationFixture({},false);
    await expect((cancelGenerationStep as any)(fixture.request)).rejects.toThrow("currently advancing");
    expect(cancellation.call).not.toHaveBeenCalled();
    expect(fixture.writes[0]?.filters).toEqual(expect.arrayContaining([["phase","provider_assets"],["status","rendering"],["phase_claimed_at",null]]));
  });
  it("derives the provider handle server-side and marks only confirmed cancellation as failed/canceled", async () => {
    const fixture = cancellationFixture();
    cancellation.call.mockResolvedValue({status:"canceled",requestId:"request-1"});
    await expect((cancelGenerationStep as any)(fixture.request)).resolves.toMatchObject({outcome:"canceled"});
    expect(cancellation.call).toHaveBeenCalledWith({capabilityId:"higgsfield-seedance-text-video",requestId:"request-1"});
    expect(fixture.writes).toEqual(expect.arrayContaining([expect.objectContaining({table:"generation_steps",patch:expect.objectContaining({status:"failed",error_code:"provider_canceled"})}),expect.objectContaining({table:"render_jobs",patch:expect.objectContaining({status:"failed",phase:"canceled"})})]));
  });
  it("restores the original job after definite provider rejection without inventing cancellation", async () => {
    const fixture = cancellationFixture();
    cancellation.call.mockRejectedValue(new CreativeProviderError("provider_rejected","higgsfield"));
    await expect((cancelGenerationStep as any)(fixture.request)).resolves.toMatchObject({outcome:"rejected"});
    expect(fixture.writes).toHaveLength(2);
    expect(fixture.writes[1]?.patch).toMatchObject({phase:"provider_assets",phase_claimed_at:null});
    expect(fixture.writes.every(write=>write.table === "render_jobs")).toBe(true);
  });
  it("stops progression and requires reconciliation when cancellation times out", async () => {
    const fixture = cancellationFixture();
    cancellation.call.mockRejectedValue(new Error("raw provider timeout https://secret.invalid?key=secret"));
    const result = await (cancelGenerationStep as any)(fixture.request);
    expect(result.outcome).toBe("reconciliation_required");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(fixture.writes).toEqual(expect.arrayContaining([expect.objectContaining({table:"generation_steps",patch:expect.objectContaining({status:"reconciliation_required",error_code:"cancellation_unconfirmed"})}),expect.objectContaining({table:"render_jobs",patch:expect.objectContaining({status:"failed",phase:"cancellation_reconciliation"})})]));
    expect(fixture.writes.some(write=>write.patch.phase === "provider_assets")).toBe(false);
  });
});
describe("contributed media preview", () => {
  it("signs only completed assets in the ledger render's exact private folder", async () => {
    const signed = vi.fn(async () => ({data:{signedUrl:"https://storage.invalid/short-lived"}}));
    const leaf: any = {status:"completed",workspace_id:"workspace",render_job_id:"render",output_storage_path:"workspace/renders/render/scene1.png"};
    privileged.current = {from: () => ({select: () => ({eq: () => ({single:async()=>({data:leaf})})})}),storage:{from:vi.fn(()=>({createSignedUrl:signed}))}};
    const request = {data:{stepId:"leaf"},context:{userId:"admin",supabase:{rpc:async()=>({data:true})}}};
    await expect((generationStepPreview as any)(request)).resolves.toMatchObject({kind:"image"});
    expect(signed).toHaveBeenCalledWith("workspace/renders/render/scene1.png",900);
    for (const path of ["other/renders/render/scene1.png","workspace/renders/other/scene1.png","workspace/renders/render/%2e%2e/scene1.png","workspace/renders/render/subfolder/scene1.png","workspace/renders/render/scene1.png?token=secret"]) {
      signed.mockClear();leaf.output_storage_path = path;
      await expect((generationStepPreview as any)(request)).rejects.toThrow("preview is unavailable");
      expect(signed).not.toHaveBeenCalled();
    }
  });
});
describe("generation paid-call reservations", () => {
  it("links retries to the latest matching step outside the new render and fails closed on lookup errors", async () => {
    const chain: any = {eq: vi.fn(() => chain),neq: vi.fn(() => chain),order: vi.fn(() => chain),limit: vi.fn(() => chain),maybeSingle: vi.fn(async () => ({data:{id:"prior-step"}}))};
    const db = {from: () => ({select: () => chain})};
    await expect(previousGenerationStep("variant","scene-1","new-render",db)).resolves.toEqual({id:"prior-step"});
    expect(chain.eq).toHaveBeenCalledWith("variant_id","variant");
    expect(chain.eq).toHaveBeenCalledWith("step_key","scene-1");
    expect(chain.neq).toHaveBeenCalledWith("render_job_id","new-render");
    expect(chain.order).toHaveBeenCalledWith("created_at",{ascending:false});
    chain.maybeSingle.mockResolvedValue({data:null});
    await expect(previousGenerationStep("variant","scene-1","new-render",db)).resolves.toBeNull();
    chain.maybeSingle.mockResolvedValue({error:{message:"offline"}});
    await expect(previousGenerationStep("variant","scene-1","new-render",db)).rejects.toThrow("no provider submission is allowed");
  });
  it("blocks a new paid retry for every active/uncertain prior provider step, excluding the unpaid root", async () => {
    const neq = vi.fn(); const statuses = vi.fn();
    const db = { from: () => ({ select: () => ({ eq: () => ({ neq: (key: string, value: string) => { neq(key,value); return {in: (key: string, values: string[]) => {statuses(key,values);return {limit: async () => ({data:[{id:"prior-step"}]})};}}; } }) }) }) };
    await expect(assertNoUncertainGeneration("variant", db)).rejects.toThrow("requires reconciliation");
    expect(neq).toHaveBeenCalledWith("provider", "autosocials");
    expect(statuses).toHaveBeenCalledWith("status", ["reserved","submitted","running","reconciliation_required"]);
  });
  it("fails closed when the new-attempt preflight or existing history read fails", async () => {
    const db = {from: () => ({select: () => ({eq: () => ({neq: () => ({in: () => ({limit: async () => ({error: {message:"offline"}})})}),order: () => ({order: async () => ({error: {message:"offline"}})})})})})};
    await expect(assertNoUncertainGeneration("variant", db)).rejects.toThrow("no provider submission is allowed");
    await expect(listRenderSteps("render", db)).rejects.toThrow("no provider submission is allowed");
  });
  it("allows new attempts when no uncertain provider steps remain and returns ordered prior render rows", async () => {
    const ordered = vi.fn(async () => ({data:[{id:"old-step"}]}));
    const db = {from: () => ({select: () => ({eq: () => ({neq: () => ({in: () => ({limit: async () => ({data:[]})})}),order: () => ({order: ordered})})})})};
    await expect(assertNoUncertainGeneration("variant", db)).resolves.toBeUndefined();
    await expect(listRenderSteps("render", db)).resolves.toEqual([{id:"old-step"}]);
    expect(ordered).toHaveBeenCalledWith("id",{ascending:true});
  });
  it("allows only one winner for concurrent duplicate submissions, including a reserved crash", async () => {
    let row: any = null;
    const db = { from: () => ({
      insert: (value: any) => ({ select: () => ({ single: async () => {
        if (row) return { error: { code: "23505" } };
        row = { id: "step", ...value }; return { data: row, error: null };
      } }) }),
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }),
    }) };
    const results = await Promise.all([beginStep(input, db), beginStep(input, db)]);
    expect(results.filter(r => r.created)).toHaveLength(1);
    expect(results[0].step.id).toBe(results[1].step.id);
    expect((await beginStep(input, db)).created).toBe(false);
  });
  it("fails closed when a reservation cannot be persisted", async () => {
    const db = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ error: { code: "offline" } }) }) }) }) };
    await expect(beginStep(input, db)).rejects.toThrow("No provider submission is allowed");
  });
  it("marks uncertain paid submissions for reconciliation and never records raw error bodies", async () => {
    let saved: any;
    const db = { from: () => ({ update: (patch: any) => { saved = patch; return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "step", ...patch } }) }) }) }; } }) };
    await failStep("step", "https://provider.invalid?token=secret", true, db);
    expect(saved.status).toBe("reconciliation_required");
    expect(saved.error_code).toBe("provider_error");
    expect(saved.completed_at).toBeUndefined();
    await updateStep("step", { status: "completed", outputStoragePath: "https://signed.invalid?token=secret", usage: { total_tokens: 20, api_key: 100 }, costKind: "estimate", costAmount: 0.08, costCurrency: "USD", modelVersion: "gpt-5-2026-01-01" }, db);
    expect(saved).toMatchObject({ cost_kind: "estimate", cost_amount: 0.08, cost_currency: "USD", output_storage_path: null, usage: { total_tokens: 20 }, model_version: "gpt-5-2026-01-01" });
    expect(saved).not.toHaveProperty("approval_status");
    expect(saved).not.toHaveProperty("creative_status");
    await updateStep("step", { costKind: "known", costAmount: -1, costCurrency: "USD" }, db);
    expect(saved).toMatchObject({ cost_kind: "unknown", cost_amount: null, cost_currency: null });
  });
});
describe("generation ledger privacy and accounting", () => {
  it("uses an allowlist, excludes raw payloads/credentials/URLs, and preserves provider settings", () => {
    expect(sanitizeGenerationSettings({ width: 1080, api_key: "secret", prompt: "private prompt", raw: { response: "private" }, voice_id: "https://signed.invalid?key=secret", duration: Infinity, generate_audio: true, canvas_style_variant: "modern_minimal", scene_pacing: "fast", image_urls_count: 3, has_custom_script: true }))
      .toEqual({ width: 1080, generate_audio: true, canvas_style_variant: "modern_minimal", scene_pacing: "fast", image_urls_count: 3, has_custom_script: true });
    expect(sanitizeUsage({ total_tokens: 5, cost: 1, raw_response: "secret", seconds: -1 })).toEqual({ total_tokens: 5 });
    expect(safeStoragePath("workspace/renders/final.mp4")).toBe("workspace/renders/final.mp4");
    expect(safeStoragePath("../private")).toBeNull();
    expect(safeStoragePath("autotoast:opaque-id")).toBe("autotoast:opaque-id");
  });
  it("never presents missing cost as zero or estimated spend as known spend", () => {
    expect(formatGenerationCost({ cost_kind: "unknown", cost_amount: null, cost_currency: null })).toBe("Unknown");
    expect(formatGenerationCost({ cost_kind: "estimate", cost_amount: 1, cost_currency: "USD" })).toBe("Estimated USD 1.0000");
    expect(formatGenerationCost({ cost_kind: "known", cost_amount: 0, cost_currency: "GBP" })).toBe("GBP 0.0000");
  });
});
