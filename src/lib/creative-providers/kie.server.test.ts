import { describe, expect, it, vi } from 'vitest';
import { KieError, pollKieTask, submitKieTask } from './kie.server';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const opts = (fetcher: typeof fetch) => ({ key: 'test-key', fetch: fetcher });

describe('Kie HTTP client', () => {
  it('submits once with the documented payload and reads the task ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { taskId: 'task_1' } }));
    await expect(submitKieTask({ model: 'nano-banana-2', input: { prompt: 'hello' } }, opts(fetcher))).resolves.toEqual({ taskId: 'task_1' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ model: 'nano-banana-2', input: { prompt: 'hello' } });
  });
  it.each(['waiting', 'queuing', 'generating', 'fail'])('normalizes %s', async (state) => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { taskId: 'abc', state } }));
    const result = await pollKieTask('abc', opts(fetcher));
    expect(result.status).toBe(({ waiting: 'pending', queuing: 'pending', generating: 'running', fail: 'failed' } as Record<string, string>)[state]);
  });
  it.each([
    { resultUrls: ['https://cdn.example.com/image.png'] },
    { data: { result_urls: ['https://cdn.example.com/video.mp4'] } },
  ])('reads completed outputs and actual credit use', async (payload) => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { taskId: 'abc', state: 'success', resultJson: JSON.stringify(payload), creditsConsumed: 3 } }));
    expect(await pollKieTask('abc', opts(fetcher))).toMatchObject({ status: 'succeeded', creditsConsumed: 3, outputUrls: [expect.stringMatching(/^https:/)] });
  });
  it('does not resubmit an ambiguous submission or leak the response', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ secret: 'sensitive' }, 503));
    await expect(submitKieTask({ model: 'veo-3-1', input: {} }, opts(fetcher))).rejects.toMatchObject({ code: 'reconciliation_required', message: 'reconciliation_required' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('treats a missing receipt as ambiguous and checks provider body codes', async () => {
    await expect(submitKieTask({ model: 'nano-banana-2', input: {} }, opts(vi.fn().mockResolvedValue(json({ code: 200, data: {} })) ))).rejects.toMatchObject({ code: 'reconciliation_required' });
    await expect(pollKieTask('abc', opts(vi.fn().mockResolvedValue(json({ code: 401, message: 'secret' }))))).rejects.toMatchObject({ code: 'authentication_failed', message: 'authentication_failed' });
  });
  it.each([
    { taskId: 'other', state: 'success', resultJson: '{"resultUrls":["https://cdn.example.com/a"]}' },
    { taskId: 'abc', state: 'unknown' },
    { taskId: 'abc', state: 'success', resultJson: '{"resultUrls":["https://127.0.0.1/private"]}' },
    { taskId: 'abc', state: 'success', resultJson: '{}' },
  ])('rejects mismatched, unknown or unsafe results', async (data) => {
    await expect(pollKieTask('abc', opts(vi.fn().mockResolvedValue(json({ code: 200, data }))))).rejects.toBeInstanceOf(KieError);
  });
  it.each([401, 403, 429])('classifies HTTP and envelope code %s definitively', async (code) => {
    const expected = code === 429 ? 'rate_limited' : 'authentication_failed';
    for (const response of [json({}, code), json({ code })]) {
      await expect(submitKieTask({ model: 'nano-banana-2', input: {} }, opts(vi.fn().mockResolvedValue(response)))).rejects.toMatchObject({ code: expected });
    }
  });
  it('trims the bearer key', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ code: 200, data: { taskId: 'abc' } }));
    await submitKieTask({ model: 'nano-banana-2', input: {} }, { key: ' test-key ', fetch: fetcher });
    expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe('Bearer test-key');
  });
  it('times out while reading the response body', async () => {
    const response = { ok: true, json: () => new Promise(() => {}) } as Response;
    await expect(submitKieTask({ model: 'nano-banana-2', input: {} }, { ...opts(vi.fn().mockResolvedValue(response)), timeoutMs: 5 })).rejects.toMatchObject({ code: 'reconciliation_required' });
  });
  it.each([
    { data: { origin_urls: ['https://cdn.example.com/low.mp4'] } },
    { resultUrls: Array(11).fill('https://cdn.example.com/a') },
    { resultUrls: ['https://service.internal/a'] },
    { resultUrls: ['https://cdn.example.com:8443/a'] },
    { resultUrls: ['https://cdn.example.com/a#secret'] },
  ])('rejects incomplete or unsafe outputs', async (result) => {
    const response = json({ code: 200, data: { taskId: 'abc', state: 'success', resultJson: JSON.stringify(result) } });
    await expect(pollKieTask('abc', opts(vi.fn().mockResolvedValue(response)))).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('accepts origin URLs only when 720p was explicitly approved', async () => {
    const response = () => json({ code: 200, data: { taskId: 'abc', state: 'success', resultJson: JSON.stringify({ data: { origin_urls: ['https://cdn.example.com/720.mp4'] } }) } });
    for (const expectedResolution of [undefined, '1080p', '4k']) {
      await expect(pollKieTask('abc', { ...opts(vi.fn().mockResolvedValue(response())), ...(expectedResolution ? { expectedResolution } : {}) })).rejects.toMatchObject({ code: 'invalid_response' });
    }
    await expect(pollKieTask('abc', { ...opts(vi.fn().mockResolvedValue(response())), expectedResolution: '720p' })).resolves.toMatchObject({ status: 'succeeded', outputUrls: ['https://cdn.example.com/720.mp4'] });
  });
  it('treats HTTP and envelope 408 as ambiguous on submit and transient on poll', async () => {
    for (const response of [() => json({}, 408), () => json({ code: 408 })]) {
      await expect(submitKieTask({ model: 'nano-banana-2', input: {} }, opts(vi.fn().mockResolvedValue(response())))).rejects.toMatchObject({ code: 'reconciliation_required' });
      await expect(pollKieTask('abc', opts(vi.fn().mockResolvedValue(response())))).rejects.toMatchObject({ code: 'provider_unavailable' });
    }
  });

});
