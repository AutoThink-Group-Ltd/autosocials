import { AsyncLocalStorage } from "node:async_hooks";
import { beginStep, updateStep, completeStep, failStep, previousGenerationStep } from "./generation-tracker.server";
import type { getAdminClient } from "./supabase-admin.server";

type Trace = { admin: ReturnType<typeof getAdminClient>; renderJobId: string; workspaceId: string; variantId: string; userId: string | null; rootStepId: string; phase?: string; sequence: number };
const context = new AsyncLocalStorage<Trace>();
export function withProductionTrace<T>(trace: Omit<Trace, "sequence">, fn: () => Promise<T>): Promise<T> {
  return context.run({ ...trace, sequence: 0 }, fn);
}

/** Records real requests only inside an explicitly queued production. No prompt or response body is retained. */
export async function trackedGenerationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const trace = context.getStore();
  if (!trace) return fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  const provider = url.hostname === "api.openai.com" ? "openai" : url.hostname === "api.elevenlabs.io" ? "elevenlabs" : "autotoast";
  let payload: Record<string, unknown> = {};
  try { if (typeof init?.body === "string") payload = JSON.parse(init.body); } catch { /* Never log provider inputs. */ }
  const formModel = init?.body instanceof FormData ? init.body.get("model") : null;
  const model = String(payload["model"] ?? payload["model_id"] ?? (typeof formModel === "string" ? formModel : null) ?? (provider === "autotoast" ? "hyperframes" : "unknown"));
  const stepKey = `${trace.phase ?? "build"}:${provider}:${++trace.sequence}:${url.pathname.replace(/[^\w-]+/g, "_")}`.slice(0, 120);
  const previous = await previousGenerationStep(trace.variantId, stepKey, trace.renderJobId, trace.admin);
  const reservation = await beginStep({ renderJobId: trace.renderJobId, workspaceId: trace.workspaceId, variantId: trace.variantId, userId: trace.userId, initiator: "sam",
    parentStepId: trace.rootStepId, stepKey, provider, model, operation: `${init?.method ?? "GET"} ${url.pathname}`, settings: payload, ...(previous ? { retryOfStepId: previous.id } : {}) }, trace.admin);
  if (!reservation.created) throw new Error("A prior generation step needs reconciliation; no duplicate request was sent.");
  await updateStep(reservation.step.id, { status: "submitted" }, trace.admin);
  let response: Response;
  try { response = await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(240000) }); }
  catch { await failStep(reservation.step.id, "request_outcome_unknown", true, trace.admin); throw new Error("Provider response was interrupted. Reconcile this attempt before retrying."); }
  const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
  await updateStep(reservation.step.id, { ...(requestId ? { providerRequestId: requestId } : {}), status: response.ok ? "running" : response.status >= 500 ? "reconciliation_required" : "failed", ...(!response.ok ? { errorCode: `http_${response.status}` } : {}) }, trace.admin);
  if (!response.ok) return response;
  if (!response.body) { await failStep(reservation.step.id, "empty_response_unverified", true, trace.admin); throw new Error("Provider returned no verifiable response. Reconciliation is required."); }
  const reader = response.body.getReader();
  const type = response.headers.get("content-type") ?? "";
  const isText = /json|event-stream/.test(type);
  const decoder = new TextDecoder(); let tail = ""; let usage: Record<string, number> = {}; let modelVersion: string | undefined;
  let terminal: "completed" | "failed" | null = null;
  let chatFinished = false, settled = false;
  const readUsage = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, any>;
    const eventType = String(object["type"] ?? ""), eventStatus = object["status"] ?? object["response"]?.status;
    if (object["error"] || ["response.failed", "error", "response.error"].includes(eventType) || eventStatus === "failed") terminal = "failed";
    else if (terminal !== "failed" && (eventType === "response.completed" || eventStatus === "completed")) terminal = "completed";
    if (Array.isArray(object["choices"]) && object["choices"].some((choice: Record<string, unknown>) => choice["finish_reason"] != null)) chatFinished = true;
    const found = object["usage"] ?? object["response"]?.usage;
    const resolved = object["model"] ?? object["response"]?.model;
    if (typeof resolved === "string") modelVersion = resolved;
    if (found) usage = { input_tokens: found.input_tokens ?? found.prompt_tokens ?? 0, output_tokens: found.output_tokens ?? found.completion_tokens ?? 0, total_tokens: found.total_tokens ?? 0, cached_tokens: found.input_tokens_details?.cached_tokens ?? found.prompt_tokens_details?.cached_tokens ?? 0 };
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (isText && tail) { try { readUsage(JSON.parse(tail)); if (!/event-stream/.test(type) && terminal !== "failed") terminal = "completed"; } catch { /* Incomplete JSON never establishes success. */ } }
          if (/event-stream/.test(type) && tail.trim().startsWith("data:")) { const data = tail.trim().slice(5).trim(); if (data === "[DONE]" && chatFinished && terminal !== "failed") terminal = "completed"; else { try { readUsage(JSON.parse(data)); } catch { /* Incomplete terminal event. */ } } }
          if (isText && terminal !== "completed") {
            await failStep(reservation.step.id, terminal === "failed" ? "provider_stream_failed" : "stream_terminal_missing", terminal !== "failed", trace.admin); settled = true;
            controller.error(new Error(terminal === "failed" ? "Provider generation failed." : "Provider stream ended without a verified completion; reconciliation is required.")); return;
          }
          await completeStep(reservation.step.id, { usage, costKind: "unknown", ...(modelVersion ? { modelVersion } : {}) }, trace.admin);
          settled = true;
          controller.close(); return;
        }
        if (isText) {
          tail += decoder.decode(next.value, { stream: true });
          if (/event-stream/.test(type)) {
            let split: number;
            while ((split = tail.indexOf("\n")) >= 0) { const line = tail.slice(0, split).trim(); tail = tail.slice(split + 1); if (line.startsWith("data:")) { const data = line.slice(5).trim(); if (data === "[DONE]" && chatFinished && terminal !== "failed") terminal = "completed"; else { try { readUsage(JSON.parse(data)); } catch { /* SSE keepalive/partial. */ } } } }
          }
          if (tail.length > 2_000_000) tail = tail.slice(-64000);
        }
        controller.enqueue(next.value);
      } catch {
        if (!settled) await failStep(reservation.step.id, "stream_outcome_unknown", true, trace.admin).catch(() => undefined);
        controller.error(new Error("Provider stream was interrupted. This attempt requires reconciliation."));
      }
    },
    async cancel() { try { await reader.cancel(); } finally { if (!settled) { await failStep(reservation.step.id, terminal === "failed" ? "provider_stream_failed" : "stream_canceled", terminal !== "failed", trace.admin); settled = true; } } },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
