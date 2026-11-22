// Server-only HeyGen client. Never log provider bodies, credentials, or signed media URLs.
import { z } from "zod";
import { parseCreativeOutputUrl } from "./creative-providers/adapters.server";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const api = "https://api.heygen.com/v3/videos";
export class HeyGenError extends Error {
  constructor(public readonly code: "not_configured" | "invalid_input" | "rejected" | "rate_limited" | "unavailable" | "reconciliation_required" | "invalid_response", public readonly retryAfter?: string | null) {
    super(`HeyGen: ${code.replaceAll("_", " ")}`);
  }
}
type Options = { key?: string; fetch?: typeof fetch };
async function request(url: string, init: RequestInit, options: Options, submission: boolean) {
  const key = options.key ?? process.env["HEYGEN_API_KEY"];
  if (!key?.trim()) throw new HeyGenError("not_configured");
  let response: Response;
  try { response = await (options.fetch ?? fetch)(url, { ...init, redirect: "error", headers: { "x-api-key": key.trim(), "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(30000) }); }
  catch { throw new HeyGenError(submission ? "reconciliation_required" : "unavailable"); }
  if (!response.ok) throw new HeyGenError(response.status === 429 ? "rate_limited" : submission && response.status >= 500 ? "reconciliation_required" : response.status >= 500 ? "unavailable" : "rejected", response.status === 429 ? response.headers.get("Retry-After") : null);
  try { return await response.json(); } catch { throw new HeyGenError(submission ? "reconciliation_required" : "invalid_response"); }
}

/** Submit once only. A network or ambiguous server error requires reconciliation. */
export async function submitHeyGenAvatar(input: { avatarId: string; audioUrl: string; aspectRatio: "9:16" | "16:9" | "1:1"; idempotencyKey: string }, options: Options = {}) {
  if (!identifier.safeParse(input.avatarId).success || !identifier.safeParse(input.idempotencyKey).success) throw new HeyGenError("invalid_input");
  try { parseCreativeOutputUrl(input.audioUrl); } catch { throw new HeyGenError("invalid_input"); }
  const raw = await request(api, { method: "POST", headers: { "Idempotency-Key": input.idempotencyKey }, body: JSON.stringify({ type: "avatar", avatar_id: input.avatarId, audio_url: input.audioUrl, aspect_ratio: input.aspectRatio, resolution: "1080p", engine: { type: "avatar_iii" } }) }, options, true);
  const parsed = z.object({ data: z.object({ video_id: identifier }) }).safeParse(raw);
  if (!parsed.success) throw new HeyGenError("reconciliation_required");
  return parsed.data.data.video_id;
}

export async function pollHeyGenAvatar(videoId: string, options: Options = {}) {
  if (!identifier.safeParse(videoId).success) throw new HeyGenError("invalid_input");
  const raw = await request(`${api}/${videoId}`, { method: "GET" }, options, false);
  const parsed = z.object({ data: z.object({ id: identifier, status: z.enum(["waiting", "pending", "processing", "completed", "failed"]), video_url: z.string().nullable().optional(), duration: z.number().positive().nullable().optional() }) }).safeParse(raw);
  if (!parsed.success || parsed.data.data.id !== videoId) throw new HeyGenError("invalid_response");
  const result = parsed.data.data;
  if (result.status !== "completed") return { status: result.status } as const;
  if (!result.video_url || !result.duration) throw new HeyGenError("invalid_response");
  let url: string; try { url = parseCreativeOutputUrl(result.video_url); } catch { throw new HeyGenError("invalid_response"); }
  return { status: "completed" as const, url, duration: result.duration };
}
