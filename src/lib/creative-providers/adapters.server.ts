// Server-only. Credentials must never cross a server-function response boundary.
import { z } from "zod";
import { getCreativeCapability, listCreativeCapabilities, validateCreativeSettings, type CreativeCapabilityId, type CreativeProviderId, type CreativeSettings } from "./registry";

import { KieError, submitKieTask, pollKieTask } from "./kie.server";
import { kieReferenceEstimate } from "../kie-pricing";

export type CreativeJobStatus = "queued" | "running" | "completed" | "failed" | "moderated" | "canceled";
export type CreativeOutput = { type: "image" | "video" | "audio"; url: string };
export type CreativeProviderHandle = { capabilityId: CreativeCapabilityId; requestId: string; statusUrl?: string; cancelUrl?: string; expectedResolution?: string };
export type CreativeProviderJob = CreativeProviderHandle & { status: CreativeJobStatus; outputs: CreativeOutput[]; errorCode?: string; expiresAt?: string; durationSeconds?: number; creditsConsumed?: number };
export type CreativeProviderErrorCode = "not_configured" | "authentication_failed" | "unsupported_operation" | "invalid_input" | "provider_rejected" | "rate_limited" | "provider_unavailable" | "invalid_response" | "reconciliation_required";
export class CreativeProviderError extends Error {
  override readonly name = "CreativeProviderError";
  constructor(public readonly code: CreativeProviderErrorCode, public readonly provider: CreativeProviderId, public readonly retryable = false, public readonly httpStatus?: number, public readonly retryAfterMs?: number) {
    const messages: Record<CreativeProviderErrorCode, string> = { authentication_failed: "Creative provider API credentials are invalid or expired.", not_configured: "Creative provider is not connected.", unsupported_operation: "This operation is not supported for this capability.", invalid_input: "Creative settings are invalid.", provider_rejected: "Creative provider rejected this request. Check account access and settings.", rate_limited: "Creative provider is busy. Try again later.", provider_unavailable: "Creative provider is temporarily unavailable.", invalid_response: "Creative provider returned an unexpected response.", reconciliation_required: "Submission outcome is unknown. Reconcile provider jobs before submitting again." };
    super(code === "authentication_failed" ? `${provider === "higgsfield" ? "Higgsfield" : provider === "golpo" ? "Golpo" : "Creative provider"} API credentials are invalid or expired. Update the connected API key before trying again.` : messages[code]);
  }
}
export type CreativeAdapterOptions = { fetch?: typeof fetch; env?: Record<string, string | undefined>; timeoutMs?: number };
const HF = "https://api.higgsfield.ai";
export function creativeRetryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
// Official v2 documentation publishes this base under its avatar API section.
const GOLPO = "https://api.golpoai.com";
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
/** Lexical check only. Downloaders MUST additionally validate/pin public DNS addresses and every redirect. */
export function parseCreativeOutputUrl(raw: string): string {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  if (raw.length > 8192 || u.protocol !== "https:" || u.username || u.password || u.port || u.hash || !host.includes(".") || host.includes(":")) throw new Error("Unsafe creative output URL");
  if (/(?:^|\.)(?:localhost|local|internal|lan|home|onion)\.?$/.test(host)) throw new Error("Unsafe creative output URL");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === undefined || b === undefined) throw new Error("Unsafe creative output URL");
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) throw new Error("Unsafe creative output URL");
  }
  return u.href;
}
const outputUrl = z.string().url().refine((s) => { try { parseCreativeOutputUrl(s); return true; } catch { return false; } });
const output = z.object({ url: outputUrl });
const hfSchema = z.object({ request_id: id, status: z.enum(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]), status_url: z.string().optional(), cancel_url: z.string().optional(), video: output.optional(), images: z.array(output).max(100).optional(), audio: output.optional(), audios: z.array(output).max(100).optional(), expires_at: z.string().datetime({ offset: true }).optional() });
const golpoIdentity = z.object({ job_id: id.optional(), id: id.optional() }).refine((v) => !!(v.job_id ?? v.id) && (!v.job_id || !v.id || v.job_id === v.id));
const golpoSchema = z.object({ job_id: id.optional(), id: id.optional(), status: z.string().max(80).optional(), state: z.string().max(80).optional(), video_url: outputUrl.nullable().optional(), url: outputUrl.nullable().optional() });
const golpoStates: Record<string, CreativeJobStatus> = { queued: "queued", in_queue: "queued", pending: "queued", processing: "running", in_progress: "running", running: "running", rendering: "running", generating: "running", completed: "completed", complete: "completed", succeeded: "completed", failed: "failed", error: "failed" };
function golpoStatus(value?: string): CreativeJobStatus | undefined { const key = value?.trim().toLowerCase() ?? ""; return Object.hasOwn(golpoStates, key) ? golpoStates[key] : undefined; }
const states = { queued: "queued", pending: "queued", in_progress: "running", processing: "running", generating: "running", completed: "completed", failed: "failed", error: "failed", nsfw: "moderated", canceled: "canceled" } as const satisfies Record<string, CreativeJobStatus>;
function environment(o?: CreativeAdapterOptions) { return o?.env ?? process.env; }
export function getCreativeProviderAvailability(env: Record<string, string | undefined> = process.env) {
  const available = { kie: Boolean(env["KIE_API_KEY"]?.trim()), higgsfield: Boolean(env["HF_API_KEY_ID"]?.trim() && env["HF_API_KEY_SECRET"]?.trim()), golpo: Boolean(env["GOLPO_API_KEY"]?.trim()), autotoast: Boolean(env["RENDER_SERVER_URL"]?.trim() && env["RENDER_SERVER_SECRET"]?.trim()), tavus: false, heygen: Boolean(env["HEYGEN_API_KEY"]?.trim() && env["RENDER_SERVER_URL"]?.trim() && env["RENDER_SERVER_SECRET"]?.trim()) };
  return listCreativeCapabilities().map((c) => ({ capabilityId: c.id, provider: c.provider, available: c.status === "supported" && available[c.provider], reason: c.status !== "supported" ? "not_integrated" : available[c.provider] ? "configured_unverified" : "credentials_missing" }));
}
function credentials(provider: CreativeProviderId, o?: CreativeAdapterOptions): Record<string, string> {
  const env = environment(o);
  if (provider === "higgsfield" && env["HF_API_KEY_ID"]?.trim() && env["HF_API_KEY_SECRET"]?.trim()) return { Authorization: `Key ${env["HF_API_KEY_ID"].trim()}:${env["HF_API_KEY_SECRET"].trim()}` };
  // AutoScribble supports the documented key header and bearer/JWT credentials together.
  if (provider === "golpo" && env["GOLPO_API_KEY"]?.trim()) return { "x-api-key": env["GOLPO_API_KEY"].trim(), Authorization: `Bearer ${env["GOLPO_API_KEY"].trim()}` };
  throw new CreativeProviderError("not_configured", provider);
}
function capability(capabilityId: CreativeCapabilityId, operation: "submit" | "poll" | "cancel" | "estimate") {
  let c; try { c = getCreativeCapability(capabilityId); } catch { throw new CreativeProviderError("invalid_input", "higgsfield"); }
  if (!c.operations[operation] || !["higgsfield", "golpo", "heygen", "kie"].includes(c.provider)) throw new CreativeProviderError("unsupported_operation", c.provider);
  return c;
}
export type CreativePreset = { id: string; name: string; previewUrl: string | null; aspectRatio?: string; groupName?: string };
/** Authenticated, read-only discovery; preset IDs must come from the current catalogue. */
export async function listCreativeProviderPresets(input: { capabilityId: "higgsfield-genjutsu-restyle" | "higgsfield-image-preset"; search?: string; cursor?: number; size?: number }, o?: CreativeAdapterOptions): Promise<{ items: CreativePreset[]; nextCursor: number | null; total: number }> {
  const parsed = z.object({ capabilityId: z.enum(["higgsfield-genjutsu-restyle", "higgsfield-image-preset"]), search: z.string().trim().min(1).max(100).optional(), cursor: z.number().int().nonnegative().optional(), size: z.number().int().min(1).max(100).optional() }).strict().safeParse(input);
  if (!parsed.success) throw new CreativeProviderError("invalid_input", "higgsfield");
  const restyle = parsed.data.capabilityId === "higgsfield-genjutsu-restyle";
  if (restyle && (input.search !== undefined || input.cursor !== undefined || input.size !== undefined)) throw new CreativeProviderError("invalid_input", "higgsfield");
  const query = new URLSearchParams();
  if (!restyle) { query.set("size", String(input.size ?? 50)); query.set("cursor", String(input.cursor ?? 0)); if (parsed.data.search) query.set("search", parsed.data.search); }
  const path = restyle ? "/models/higgsfield/genjutsu/restyle/v1.0/presets" : "/marketing-studio/image/presets";
  const raw = await request("higgsfield", `${HF}${path}${query.size ? `?${query}` : ""}`, { method: "GET" }, o);
  const uuid = z.string().uuid(), name = z.string().trim().min(1).max(1000);
  if (restyle) {
    const value = z.object({ model: z.literal("higgsfield/genjutsu/restyle/v1.0"), items: z.array(z.object({ id: uuid, name, preview_url: outputUrl })).max(2000) }).safeParse(raw);
    if (!value.success) throw new CreativeProviderError("invalid_response", "higgsfield");
    return { items: value.data.items.map((item) => ({ id: item.id, name: item.name, previewUrl: item.preview_url })), nextCursor: null, total: value.data.items.length };
  }
  const value = z.object({ total: z.number().int().nonnegative(), cursor: z.number().int().nonnegative().nullable(), items: z.array(z.object({ id: uuid, name, cover_image: outputUrl.nullable().optional(), metadata: z.object({ aspect_ratio: z.string().max(30).optional(), group_name: z.string().max(1000).optional() }).optional() })).max(100) }).safeParse(raw);
  if (!value.success || (value.data.cursor !== null && value.data.cursor <= (input.cursor ?? 0))) throw new CreativeProviderError("invalid_response", "higgsfield");
  return { items: value.data.items.map((item) => ({ id: item.id, name: item.name, previewUrl: item.cover_image ?? null, ...(item.metadata?.aspect_ratio ? { aspectRatio: item.metadata.aspect_ratio } : {}), ...(item.metadata?.group_name ? { groupName: item.metadata.group_name } : {}) })), nextCursor: value.data.cursor, total: value.data.total };
}
function settings(capabilityId: CreativeCapabilityId, raw: unknown): CreativeSettings {
  try { return validateCreativeSettings(capabilityId, raw); } catch { throw new CreativeProviderError("invalid_input", getCreativeCapability(capabilityId).provider); }
}
/** Validate both origin and exact expected resource path before attaching credentials. */
function checkedUrl(raw: string, provider: CreativeProviderId, requestId: string, operation: "status" | "cancel"): string {
  const base = provider === "higgsfield" ? HF : GOLPO;
  const path = provider === "higgsfield" ? `/requests/${requestId}/${operation}` : `/api/v2/videos/status/${requestId}`;
  let u: URL; try { u = new URL(raw); } catch { throw new CreativeProviderError("invalid_response", provider); }
  if (u.origin !== base || u.pathname !== path || u.search || u.hash || u.username || u.password) throw new CreativeProviderError("invalid_response", provider);
  return u.href;
}
async function request(provider: CreativeProviderId, url: string, init: RequestInit, o: CreativeAdapterOptions | undefined, ambiguousGolpo = false, empty = false): Promise<unknown> {
  const controller = new AbortController();
  const timeout = Number.isFinite(o?.timeoutMs) ? Math.max(1, Math.min(o!.timeoutMs!, 120000)) : 30000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // Redirects are rejected so an API cannot redirect a credential-bearing request elsewhere.
    const response = await (o?.fetch ?? fetch)(url, { ...init, headers: { ...credentials(provider, o), ...init.headers }, signal: controller.signal, redirect: "error" });
    if (!response.ok) {
      if (response.status === 401) throw new CreativeProviderError("authentication_failed", provider, false, response.status);
      if (ambiguousGolpo && response.status >= 500) throw new CreativeProviderError("reconciliation_required", provider, false, response.status);
      const code = response.status === 429 ? "rate_limited" : response.status >= 500 ? "provider_unavailable" : "provider_rejected";
      throw new CreativeProviderError(code, provider, response.status === 429 || response.status >= 500, response.status, creativeRetryAfterMs(response.headers.get("Retry-After")));
    }
    if (empty) return undefined;
    try { return await response.json(); } catch { throw new CreativeProviderError(ambiguousGolpo ? "reconciliation_required" : "invalid_response", provider); }
  } catch (e) {
    if (e instanceof CreativeProviderError) throw e;
    // Never forward fetch errors or provider bodies: they may contain URLs, input or credentials.
    throw new CreativeProviderError(ambiguousGolpo ? "reconciliation_required" : "provider_unavailable", provider, !ambiguousGolpo);
  } finally { clearTimeout(timer); }
}
export function parseCreativeProviderJob(capabilityId: CreativeCapabilityId, raw: unknown): CreativeProviderJob {
  const c = getCreativeCapability(capabilityId);
  if (c.provider === "higgsfield") {
    const parsed = hfSchema.safeParse(raw); if (!parsed.success) throw new CreativeProviderError("invalid_response", c.provider);
    const v = parsed.data, statusUrl = checkedUrl(v.status_url ?? `${HF}/requests/${v.request_id}/status`, c.provider, v.request_id, "status"), cancelUrl = checkedUrl(v.cancel_url ?? `${HF}/requests/${v.request_id}/cancel`, c.provider, v.request_id, "cancel");
    const outputs: CreativeOutput[] = [];
    if (v.status === "completed") { if (v.video) outputs.push({ type: "video", url: v.video.url }); for (const image of v.images ?? []) outputs.push({ type: "image", url: image.url }); for (const audio of v.audios ?? (v.audio ? [v.audio] : [])) outputs.push({ type: "audio", url: audio.url });
      if (!outputs.some((item) => item.type === c.output)) throw new CreativeProviderError("invalid_response", c.provider);
    }
    return { capabilityId, requestId: v.request_id, status: states[v.status], statusUrl, cancelUrl, outputs, ...(v.expires_at ? { expiresAt: v.expires_at } : {}), ...(["failed", "nsfw"].includes(v.status) ? { errorCode: v.status === "nsfw" ? "content_moderated" : "generation_failed" } : {}) };
  }
  if (c.provider === "golpo") {
    const parsed = golpoSchema.safeParse(raw); if (!parsed.success) throw new CreativeProviderError("invalid_response", c.provider);
    const v = parsed.data;
    const identity = golpoIdentity.safeParse(v), status = golpoStatus(v.status ?? v.state), videoUrl = v.video_url ?? v.url;
    // Accept AutoScribble's known aliases without guessing success from unknown or conflicting states.
    if (!identity.success || !status || (v.status && v.state && golpoStatus(v.status) !== golpoStatus(v.state)) || (status === "completed" && !videoUrl)) throw new CreativeProviderError("invalid_response", c.provider);
    const requestId = identity.data.job_id ?? identity.data.id!;
    return { capabilityId, requestId, status, statusUrl: `${GOLPO}/api/v2/videos/status/${requestId}`, outputs: status === "completed" && videoUrl ? [{ type: "video", url: videoUrl }] : [], ...(status === "failed" ? { errorCode: "generation_failed" } : {}) };
  }
  throw new CreativeProviderError("unsupported_operation", c.provider);
}
export async function submitCreativeProviderJob(input: { capabilityId: CreativeCapabilityId; settings: unknown; idempotencyKey: string }, o?: CreativeAdapterOptions): Promise<CreativeProviderJob> {
  const c = capability(input.capabilityId, "submit"), body = settings(input.capabilityId, input.settings);
  if (!/^[\x21-\x7E]{1,255}$/.test(input.idempotencyKey)) throw new CreativeProviderError("invalid_input", c.provider);
  if (c.provider === "kie") {
    try {
      const result = await submitKieTask({ model: c.output === "image" ? "nano-banana-2" : "veo-3-1", input: body }, kieOptions(o));
      return { capabilityId: c.id, requestId: result.taskId, status: "queued", outputs: [] };
    } catch (error) { throw mapKieError(error); }
  }
  if (c.provider === "heygen") {
    if (typeof body.audio_url !== "string") throw new CreativeProviderError("invalid_input", c.provider);
    try {
      const { submitHeyGenAvatar } = await import("../heygen-avatar.server");
      const requestId = await submitHeyGenAvatar({ avatarId: String(body.avatar_id), audioUrl: body.audio_url, aspectRatio: body.aspect_ratio as "9:16" | "16:9" | "1:1", idempotencyKey: input.idempotencyKey }, { key: environment(o)["HEYGEN_API_KEY"] ?? "", ...(o?.fetch ? { fetch: o.fetch } : {}) });
      return { capabilityId: input.capabilityId, requestId, status: "queued", outputs: [] };
    } catch (error) { throw mapHeyGenError(error); }
  }
  const raw = await request(c.provider, `${c.provider === "higgsfield" ? HF : GOLPO}/${c.endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", ...(c.provider === "higgsfield" ? { "Idempotency-Key": input.idempotencyKey } : {}) }, body: JSON.stringify(body) }, o, c.provider === "golpo");
  // Golpo does not promise a full status receipt; successful submission only needs job_id.
  if (c.provider === "golpo") {
    const receipt = golpoIdentity.safeParse(raw);
    if (!receipt.success) throw new CreativeProviderError("reconciliation_required", c.provider);
    const requestId = receipt.data.job_id ?? receipt.data.id!;
    return { capabilityId: input.capabilityId, requestId, status: "queued", statusUrl: `${GOLPO}/api/v2/videos/status/${requestId}`, outputs: [] };
  }
  return parseCreativeProviderJob(input.capabilityId, raw);
}
export async function pollCreativeProviderJob(handle: CreativeProviderHandle, o?: CreativeAdapterOptions): Promise<CreativeProviderJob> {
  const c = capability(handle.capabilityId, "poll"); if (!id.safeParse(handle.requestId).success) throw new CreativeProviderError("invalid_input", c.provider);
  if (c.provider === "kie") {
    if (handle.statusUrl || handle.cancelUrl) throw new CreativeProviderError("invalid_input", "kie");
    try {
      const result = await pollKieTask(handle.requestId, { ...kieOptions(o), ...(handle.expectedResolution ? { expectedResolution: handle.expectedResolution } : {}) });
      return { capabilityId: c.id, requestId: handle.requestId, status: result.status === "succeeded" ? "completed" : result.status === "failed" ? "failed" : result.status === "running" ? "running" : "queued", outputs: (result.outputUrls ?? []).map((url) => ({ type: c.output, url: parseCreativeOutputUrl(url) })), ...(result.creditsConsumed !== undefined ? { creditsConsumed: result.creditsConsumed } : {}), ...(result.status === "failed" ? { errorCode: "generation_failed" } : {}) };
    } catch (error) { throw mapKieError(error); }
  }
  if (c.provider === "heygen") {
    // Never follow a caller-supplied status URL when attaching the provider key.
    if (handle.statusUrl || handle.cancelUrl) throw new CreativeProviderError("invalid_input", c.provider);
    try {
      const { pollHeyGenAvatar } = await import("../heygen-avatar.server");
      const result = await pollHeyGenAvatar(handle.requestId, { key: environment(o)["HEYGEN_API_KEY"] ?? "", ...(o?.fetch ? { fetch: o.fetch } : {}) });
      return { capabilityId: handle.capabilityId, requestId: handle.requestId, status: result.status === "completed" ? "completed" : result.status === "failed" ? "failed" : result.status === "processing" ? "running" : "queued", outputs: result.status === "completed" ? [{ type: "video", url: result.url }] : [], ...(result.status === "completed" ? { durationSeconds: result.duration } : {}), ...(result.status === "failed" ? { errorCode: "generation_failed" } : {}) };
    } catch (error) { throw mapHeyGenError(error); }
  }
  const rawUrl = handle.statusUrl ?? (c.provider === "higgsfield" ? `${HF}/requests/${handle.requestId}/status` : `${GOLPO}/api/v2/videos/status/${handle.requestId}`);
  const raw = await request(c.provider, checkedUrl(rawUrl, c.provider, handle.requestId, "status"), { method: "GET" }, o);
  const result = parseCreativeProviderJob(handle.capabilityId, raw);
  if (result.requestId !== handle.requestId) throw new CreativeProviderError("invalid_response", c.provider);
  return result;
}
export async function cancelCreativeProviderJob(handle: CreativeProviderHandle, o?: CreativeAdapterOptions): Promise<CreativeProviderJob> {
  const c = capability(handle.capabilityId, "cancel"); if (!id.safeParse(handle.requestId).success) throw new CreativeProviderError("invalid_input", c.provider);
  const url = checkedUrl(handle.cancelUrl ?? `${HF}/requests/${handle.requestId}/cancel`, c.provider, handle.requestId, "cancel");
  await request(c.provider, url, { method: "POST" }, o, false, true);
  // Only a successful queued cancellation is normalized; HTTP400 remains rejected.
  return { capabilityId: handle.capabilityId, requestId: handle.requestId, status: "canceled", outputs: [] };
}
export async function estimateCreativeProviderJob(input: { capabilityId: CreativeCapabilityId; settings: unknown }, o?: CreativeAdapterOptions): Promise<{ usd: string }> {
  const c = capability(input.capabilityId, "estimate"), body = settings(input.capabilityId, input.settings);
  if (c.provider === "kie") return { usd: kieReferenceEstimate(c.id, body).toFixed(4) };
  if (c.provider === "heygen") {
    // Published self-service Avatar III studio rate ($0.99/minute, 13 Nov 2026).
    // The queue MUST bind duration to the approved film length and ensure the audio is no longer.
    const duration = body.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 60) throw new CreativeProviderError("invalid_input", c.provider);
    return { usd: (Math.ceil(duration / 60 * 0.99 * 10000) / 10000).toFixed(4) };
  }
  const raw = await request(c.provider, `${HF}/estimate/${c.endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, o);
  const description = z.object({ type: z.literal("description"), pricing_description: z.string().min(1) }).safeParse(raw);
  if (description.success) {
    // Observed estimate endpoint contract (5 Nov 2026), not a model-written price.
    // Support only exact known output dimensions; never infer a 4K or exotic-aspect quote.
    const text = description.data.pricing_description;
    const input = body as Record<string, unknown>;
    const seedance2Rate = text.match(/^Token-metered pricing\. Billable video tokens = ceil\(generated video seconds × output width × output height × 24 fps \/ 1024\)\. Image and audio references do not count as video input\. Per 1,000 video tokens: 480p\/720p\/1080p \$(\d+(?:\.\d+)?), 4K \$\d+(?:\.\d+)?\. Rates shown are before any applicable customer discount\.$/);
    if (c.id === "higgsfield-seedance-text-video" && seedance2Rate && ["9:16", "16:9"].includes(String(input.aspect_ratio)) && ["480p", "720p", "1080p"].includes(String(input.resolution)) && typeof input.duration === "number") {
      const shortSide = Number(String(input.resolution).slice(0, -1));
      const tokens = Math.ceil(input.duration * shortSide * Math.round(shortSide * 16 / 9) * 24 / 1024);
      const cost = tokens / 1000 * Number(seedance2Rate[1]);
      if (Number.isFinite(cost) && cost > 0) return { usd: (Math.ceil(cost * 10000) / 10000).toFixed(4) };
    }
    // Seedance 2.5 quotes a per-token rate instead of a numeric total. Only derive a quote for
    // image-only references with known dimensions and duration; video inputs add billable time.
    const v = body as Record<string, unknown>;
    const ratio = v.aspect_ratio;
    const resolution = v.resolution;
    const duration = v.duration;
    const media = v.video_urls;
    if (c.id === "higgsfield-seedance-reference-video" && (ratio === "9:16" || ratio === "16:9")
      && (resolution === "480p" || resolution === "720p" || resolution === "1080p")
      && typeof duration === "number" && duration >= 4 && duration <= 30
      && (!Array.isArray(media) || media.length === 0)) {
      const shortSide = Number(resolution.slice(0, -1));
      const longSide = Math.round(shortSide * 16 / 9);
      const rates = description.data.pricing_description.split("Each 1,000 video tokens costs")[1]?.split("If video inputs")[0];
      const rate = resolution === "1080p"
        ? rates?.match(/\$([0-9]+(?:\.[0-9]+)?) at 1080p\b/)?.[1]
        : rates?.match(/\$([0-9]+(?:\.[0-9]+)?) at 480p or 720p\b/)?.[1];
      if (rate) {
        const tokens = Math.ceil(shortSide * longSide * duration * 24 / 1024);
        const cost = tokens / 1000 * Number(rate);
        if (Number.isFinite(cost) && cost > 0) return { usd: cost.toFixed(4) };
      }
    }
    throw new Error("Higgsfield returned descriptive pricing that cannot be safely calculated for these settings. Generation has not started because its cost cannot be checked against the configured limit.");
  }
  const parsed = z.object({ usd: z.string().regex(/^\d+(?:\.\d+)?$/) }).safeParse(raw);
  if (!parsed.success) throw new CreativeProviderError("invalid_response", c.provider);
  return parsed.data;
}

function mapHeyGenError(error: unknown): CreativeProviderError {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "invalid_response";
  const mapped: CreativeProviderErrorCode = code === "not_configured" ? "not_configured" : code === "invalid_input" ? "invalid_input" : code === "rejected" ? "provider_rejected" : code === "rate_limited" ? "rate_limited" : code === "unavailable" ? "provider_unavailable" : code === "reconciliation_required" ? "reconciliation_required" : "invalid_response";
  const retryAfter = error && typeof error === "object" && "retryAfter" in error && typeof error.retryAfter === "string" ? creativeRetryAfterMs(error.retryAfter) : undefined;
  return new CreativeProviderError(mapped, "heygen", mapped === "provider_unavailable" || mapped === "rate_limited", mapped === "rate_limited" ? 429 : undefined, retryAfter);
}

function kieOptions(o?: CreativeAdapterOptions) {
  return { key: environment(o)["KIE_API_KEY"] ?? "", ...(o?.fetch ? { fetch: o.fetch } : {}), ...(o?.timeoutMs ? { timeoutMs: o.timeoutMs } : {}) };
}
function mapKieError(error: unknown): CreativeProviderError {
  if (!(error instanceof KieError)) return new CreativeProviderError("invalid_response", "kie");
  const code = error.code === "missing_key" ? "not_configured" : error.code === "invalid_request" ? "invalid_input" : error.code;
  return new CreativeProviderError(code, "kie", ["provider_unavailable", "rate_limited"].includes(code), undefined, error.retryAfterMs);
}
