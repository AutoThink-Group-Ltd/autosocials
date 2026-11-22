const BASE = 'https://api.kie.ai/api/v1/jobs';

type Options = { key?: string; fetch?: typeof fetch; timeoutMs?: number; expectedResolution?: string };
export type KieErrorCode = 'missing_key' | 'invalid_request' | 'reconciliation_required' | 'provider_rejected' | 'authentication_failed' | 'rate_limited' | 'provider_unavailable' | 'invalid_response';
export class KieError extends Error {
  constructor(public readonly code: KieErrorCode, public readonly retryAfterMs?: number) {
    super(code);
    this.name = 'KieError';
  }
}
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : undefined;
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}
function safeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && host.includes('.') && !['localhost', 'local', 'internal', 'lan', 'home', 'onion'].some(suffix => host === suffix || host.endsWith(`.${suffix}`)) && !host.includes(':') && !/^\d+(?:\.\d+){3}$/.test(host);
  } catch { return false; }
}
function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 3600000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 3600000)) : undefined;
}
async function request(path: string, init: RequestInit, options: Options, submitting: boolean): Promise<RecordValue> {
  const key = (options.key ?? process.env['KIE_API_KEY'])?.trim();
  if (!key) throw new KieError('missing_key');
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new KieError(submitting ? 'reconciliation_required' : 'provider_unavailable'));
    }, options.timeoutMs ?? 30000);
  });
  const classify = (code: number, delay?: number): KieError => {
    if (code === 401 || code === 403) return new KieError('authentication_failed', delay);
    if (code === 429) return new KieError('rate_limited', delay);
    if (code === 408) return new KieError(submitting ? 'reconciliation_required' : 'provider_unavailable', delay);
    if (submitting && code >= 500) return new KieError('reconciliation_required', delay);
    return new KieError(code >= 500 ? 'provider_unavailable' : 'provider_rejected', delay);
  };
  try {
    return await Promise.race([timedOut, (async () => {
      let response: Response;
      try {
        response = await (options.fetch ?? fetch)(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: controller.signal, redirect: 'error' });
      } catch {
        throw new KieError(submitting ? 'reconciliation_required' : 'provider_unavailable');
      }
      if (!response.ok) throw classify(response.status, retryAfter(response));
      let body: RecordValue | undefined;
      try { body = record(await response.json()); } catch { /* invalid receipt */ }
      if (!body || typeof body['code'] !== 'number') throw new KieError(submitting ? 'reconciliation_required' : 'invalid_response');
      if (body['code'] !== 200) throw classify(body['code'], retryAfter(response));
      return body;
    })()]);
  } finally { clearTimeout(timeout); }
}
export async function submitKieTask(task: { model: 'nano-banana-2' | 'veo-3-1'; input: Record<string, unknown> }, options: Options = {}): Promise<{ taskId: string }> {
  if (!['nano-banana-2', 'veo-3-1'].includes(task.model) || !record(task.input)) throw new KieError('invalid_request');
  const body = await request('/createTask', { method: 'POST', body: JSON.stringify(task) }, options, true);
  const taskId = record(body['data'])?.taskId;
  if (!validId(taskId)) throw new KieError('reconciliation_required');
  return { taskId };
}
export type KiePollResult = { status: 'pending' | 'running' | 'succeeded' | 'failed'; outputUrls?: string[]; creditsConsumed?: number };
export async function pollKieTask(taskId: string, options: Options = {}): Promise<KiePollResult> {
  if (!validId(taskId)) throw new KieError('invalid_request');
  const body = await request(`/recordInfo?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' }, options, false);
  const data = record(body['data']);
  if (!data || data['taskId'] !== taskId) throw new KieError('invalid_response');
  const state = data['state'];
  const status = state === 'waiting' || state === 'queuing' ? 'pending' : state === 'generating' ? 'running' : state === 'success' ? 'succeeded' : state === 'fail' ? 'failed' : undefined;
  if (!status) throw new KieError('invalid_response');
  const result: KiePollResult = { status };
  if (typeof data['creditsConsumed'] === 'number' && Number.isFinite(data['creditsConsumed']) && data['creditsConsumed'] >= 0) result.creditsConsumed = data['creditsConsumed'];
  if (status === 'succeeded') {
    let payload: unknown = data['resultJson'] ?? data['response'];
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { throw new KieError('invalid_response'); }
    }
    const resultObject = record(payload);
    const nested = record(resultObject?.['data']);
    const urls = resultObject?.['resultUrls'] ?? nested?.['result_urls'] ?? (options.expectedResolution === '720p' ? nested?.['origin_urls'] : undefined);
    if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10 || !urls.every(safeUrl)) throw new KieError('invalid_response');
    result.outputUrls = urls;
  }
  return result;
}
