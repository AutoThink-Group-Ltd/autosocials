/** Server-only Virlo transport. Callers must authorize and account for every operation. */
const ORIGIN = "https://api.virlo.ai/v1";
import type { VirloRequest } from "./virlo-catalog";

export type VirloPlatform = "tiktok" | "instagram" | "youtube";
export type VirloSearch = {
  kind: "videos" | "creators";
  query: string;
  platform?: VirloPlatform;
  page?: number;
};

export type VirloReceipt = {
  status: number;
  costUsd: number | null;
  creditsUsed: number | null;
};

/** A separate switch allows an operator to disable the integration without removing its credential. */
export function virloAvailable(): boolean {
  return process.env["VIRLO_ENABLED"] !== "false" && virloHasKey();
}
export function virloHasKey(): boolean { return Boolean(process.env["VIRLO_API_KEY"]?.trim()); }

export class VirloError extends Error {
  constructor(message: string, readonly receipt: VirloReceipt | null) {
    super(message);
    this.name = "VirloError";
  }
}

function amount(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function callVirlo(request: VirloRequest, allowPauseWhileDisabled = false): Promise<{ data: unknown; receipt: VirloReceipt }> {
  const key = process.env["VIRLO_API_KEY"];
  const safePause = allowPauseWhileDisabled && ((request.method === "PATCH" && /^\/tracking\/(creators|videos)\/[0-9a-f-]+$/i.test(request.path) && request.body?.["status"] === "paused") || (request.method === "PUT" && /^\/agents\/[0-9a-f-]+$/i.test(request.path) && request.body?.["active"] === false && Object.entries(request.body).every(([key, value]) => key === "active" || value === undefined)));
  if ((!virloAvailable() && !safePause) || !key) throw new VirloError("Research is not configured or is disabled", null);
  const url = new URL(`${ORIGIN}${request.path}`);
  for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);
  let response: Response;
  try {
    response = await fetch(url, { method: request.method, headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}), signal: AbortSignal.timeout(30_000), redirect: "error" });
  } catch { throw new VirloError("Research could not be completed; its provider charge is unknown", null); }
  const receipt = { status: response.status, costUsd: amount(response.headers.get("X-Cost")), creditsUsed: amount(response.headers.get("X-Credits-Used")) };
  if (!response.ok) throw new VirloError(response.status === 402 ? "Research is unavailable because the provider balance is low" : response.status === 429 ? "Research is busy; try later" : "Research is temporarily unavailable", receipt);
  if (response.status === 204 && request.method === "DELETE") return { data: { deleted: true }, receipt };
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error();
    return { data: payload.data, receipt };
  } catch { throw new VirloError("Research returned an unreadable result", receipt); }
}

/** Only fixed, reviewed operations are available; caller input never determines the host or path. */
export function buildVirloSearch(input: VirloSearch) {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 200) throw new Error("Enter a search of 2 to 200 characters");
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 40) throw new Error("Invalid search page");
  if (input.platform && !["tiktok", "instagram", "youtube"].includes(input.platform)) throw new Error("Invalid platform");
  if (input.kind !== "videos" && input.kind !== "creators") throw new Error("Invalid search type");
  return {
    url: `${ORIGIN}/search/${input.kind}`,
    body: { scope: "virlo_library", topics: [query], ...(input.platform ? { platforms: [input.platform] } : {}), page },
  };
}

export async function searchVirlo(input: VirloSearch, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<{ data: unknown; receipt: VirloReceipt }> {
  const key = process.env["VIRLO_API_KEY"];
  if (!virloAvailable() || !key) throw new VirloError("Research is not configured or is disabled", null);
  const request = buildVirloSearch(input);
  let response: Response;
  try {
    response = await fetcher(request.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request.body),
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
  } catch {
    // The request may have reached Virlo: never automatically repeat a potentially billable call.
    throw new VirloError("Research could not be completed; its provider charge is unknown", null);
  }
  const receipt = { status: response.status, costUsd: amount(response.headers.get("X-Cost")), creditsUsed: amount(response.headers.get("X-Credits-Used")) };
  if (!response.ok) {
    const message = response.status === 402 ? "Research is temporarily unavailable because the provider balance is low"
      : response.status === 429 ? "Research is temporarily busy; please try again later"
      : "Research is temporarily unavailable";
    throw new VirloError(message, receipt);
  }
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error("Invalid response");
    return { data: payload.data, receipt };
  } catch {
    throw new VirloError("Research returned an unreadable result", receipt);
  }
}
