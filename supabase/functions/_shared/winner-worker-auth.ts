// The scheduler secret is never accepted as a user identity or returned to clients.
export async function isWinnerWorker(req: Request, admin: any): Promise<boolean> {
  const provided = req.headers.get('x-winner-job-secret');
  if (!provided || provided.length > 128) return false;
  const { data, error } = await admin.from('internal_job_secrets').select('secret').eq('name', 'winner_sync').maybeSingle();
  if (error || typeof data?.secret !== 'string') return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(provided), digest(data.secret)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
