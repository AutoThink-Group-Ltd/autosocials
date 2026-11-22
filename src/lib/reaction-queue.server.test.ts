import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRow, RenderRow } from "./asset-versions.server";
import type { getAdminClient } from "./supabase-admin.server";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(), poll: vi.fn(), estimate: vi.fn(), begin: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn(), download: vi.fn(),
  storedState: null as unknown,
}));
vi.mock("./creative-providers/adapters.server", async (original) => ({
  ...await original<typeof import("./creative-providers/adapters.server")>(),
  getCreativeProviderAvailability: () => [{ capabilityId: "heygen-avatar", available: true }, { capabilityId: "autotoast-hyperframes", available: true }],
  submitCreativeProviderJob: mocks.submit, pollCreativeProviderJob: mocks.poll, estimateCreativeProviderJob: mocks.estimate,
}));
vi.mock("./generation-tracker.server", () => ({
  previousGenerationStep: vi.fn().mockResolvedValue(null), beginStep: mocks.begin, updateStep: mocks.update, completeStep: mocks.complete, failStep: mocks.fail,
}));
vi.mock("./creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { advanceProduction } from "./production.server";
import { reactionComposition } from "./reaction-composition";
import { validateComposition } from "./composition-rules";

const ws = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const audioPath = `${ws}/renders/${jobId}.reaction.wav`;
const signedUrl = "https://storage.example.test/signed-reaction-audio";
const fields = ["audience", "objective", "insight", "argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending", "typography", "sound", "evidence", "asset_strategy"];
const step = { id: "presenter", capability_id: "heygen-avatar", role: "scene", purpose: "React alongside the demo", settings: { avatar_id: "Daphne_public_4", duration: 15, aspect_ratio: "9:16" }, reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true };
const asset = { id: "asset", workspace_id: ws, duration_s: 15, size: "1080x1920", voiceover: "Approved narration", production_plan: { version: 1, direction: Object.fromEntries(fields.map((key) => [key, "approved"])), steps: [step], assumptions: [], diversity_issues: [], delivery: { mode: "assembled_ad" } } } as unknown as AssetRow;
const job = { id: jobId, workspace_id: ws, created_by: "user", audio_path: audioPath, production_state: { outputs: {}, engine_version: 1 } } as unknown as RenderRow;

function makeAdmin() {
  const sign = vi.fn().mockResolvedValue({ data: { signedUrl }, error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    rpc: vi.fn(async (name: string) => ({ data: name === "acquire_creative_provider_slot" ? { acquired: true, slot_id: "slot", lease_token: "lease", reason: "acquired" } : true, error: null })),
    from: vi.fn((table: string) => {
      const query: Record<string, any> = {};
      query.select = () => query;
      query.eq = () => query;
      query.update = (value: { production_state: unknown }) => { mocks.storedState = value.production_state; return query; };
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: table === "brand_files" ? [] : null, error: null }).then(resolve, reject);
      return query;
    }),
    storage: { from: () => ({ createSignedUrl: sign, upload }) },
  };
  return { admin: admin as unknown as ReturnType<typeof getAdminClient>, sign, upload };
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.storedState = null;
  mocks.estimate.mockResolvedValue({ usd: "0.2475" });
  mocks.update.mockResolvedValue({}); mocks.complete.mockResolvedValue({}); mocks.fail.mockResolvedValue({});
  mocks.submit.mockResolvedValue({ capabilityId: "heygen-avatar", requestId: "v_123", status: "queued", outputs: [] });
  mocks.poll.mockResolvedValue({ capabilityId: "heygen-avatar", requestId: "v_123", status: "completed", outputs: [{ type: "video", url: "https://files.heygen.ai/video.mp4" }], durationSeconds: 11.2 });
  mocks.download.mockResolvedValue({ extension: "mp4", bytes: new Uint8Array([1, 2, 3]), contentType: "video/mp4" });
});

describe("HeyGen reaction production queue", () => {
  it("submits once with owned saved narration, then polls and stores the verified video duration", async () => {
    const { admin, sign, upload } = makeAdmin();
    mocks.begin.mockResolvedValueOnce({ created: true, step: { id: "ledger-1" } }).mockResolvedValueOnce({ created: false, step: { id: "ledger-1", status: "running", provider_job_id: "v_123", usage: {} } });
    const first = await advanceProduction(admin, job, asset);
    expect(first.waiting).toBe(true);
    expect(sign).toHaveBeenCalledWith(audioPath, 7200);
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ capabilityId: "heygen-avatar", idempotencyKey: "ledger-1", settings: expect.objectContaining({ audio_url: signedUrl, duration: 15 }) }));
    const second = await advanceProduction(admin, { ...job, production_state: first.state as never }, asset);
    expect(second.waiting).toBe(false);
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.poll).toHaveBeenCalledWith({ capabilityId: "heygen-avatar", requestId: "v_123" });
    expect(upload).toHaveBeenCalledWith(`${ws}/renders/${jobId}/presenter.mp4`, expect.any(Uint8Array), expect.objectContaining({ contentType: "video/mp4" }));
    expect(second.state.outputs.presenter).toMatchObject({ durationSeconds: 11.2, stepId: "ledger-1" });
    expect(mocks.complete).toHaveBeenCalledWith("ledger-1", expect.objectContaining({ usage: { seconds: 11.2 } }), admin);
    expect(mocks.storedState).toMatchObject({ outputs: { presenter: { durationSeconds: 11.2 } } });

    // Assemble the returned presenter with an uploaded app recording. The
    // renderer receives the same signed narration URL used at submission.
    const demoPath = "assets/demo.mp4", avatarPath = "generated/presenter.mp4";
    const avatarSeconds = second.state.outputs.presenter?.durationSeconds;
    expect(avatarSeconds).toBe(11.2);
    const html = reactionComposition({ width: 1080, height: 1920, duration: 15, demoPath, demoSeconds: 8, avatarPath, avatarSeconds: avatarSeconds!, narrationSeconds: 11 });
    const rendererInput = { html, audioUrl: signedUrl };
    expect(rendererInput.audioUrl).toBe((mocks.submit.mock.calls[0][0] as { settings: { audio_url: string } }).settings.audio_url);
    expect(rendererInput.html).toMatch(/id="avatar"[^>]*data-start="0"[^>]*data-media-start="0"[^>]*muted/);
    expect(rendererInput.html).toContain(`src="${demoPath}"`);
    expect(validateComposition({ html, duration: 15, files: [demoPath, avatarPath] })).toEqual([]);
    expect(mocks.submit).toHaveBeenCalledOnce();
  });
  it("does not submit if narration is outside the workspace", async () => {
    const { admin } = makeAdmin();
    mocks.begin.mockResolvedValue({ created: true, step: { id: "ledger-1" } });
    await expect(advanceProduction(admin, { ...job, audio_path: "other/renders/voice.wav" }, asset)).rejects.toThrow("scope mismatch");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("recovers a completed ledger entry and its duration without contacting the provider", async () => {
    const { admin } = makeAdmin();
    mocks.begin.mockResolvedValue({ created: false, step: { id: "ledger-1", status: "completed", output_storage_path: `${ws}/renders/${jobId}/presenter.mp4`, usage: { seconds: 11.2 } } });
    const result = await advanceProduction(admin, job, asset);
    expect(result.waiting).toBe(false);
    expect(result.state.outputs.presenter).toMatchObject({ durationSeconds: 11.2, stepId: "ledger-1" });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.poll).not.toHaveBeenCalled();
  });
});
