import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { isWinnerWorker } from '../_shared/winner-worker-auth.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key);
  if (!await isWinnerWorker(req, admin)) return new Response('Unauthorized', { status: 401 });
  const { data: accountId, error } = await admin.rpc('next_winner_account');
  if (error) return new Response('Could not select account', { status: 500 });
  if (!accountId) return Response.json({ status: 'idle' });
  try {
    const result = await fetch(`${url}/functions/v1/winner-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-winner-job-secret': req.headers.get('x-winner-job-secret')! }, body: JSON.stringify({ account_id: accountId }), signal: AbortSignal.timeout(75000) });
    if (!result.ok) return Response.json({ status: 'failed' }, { status: 502 });
    const body = await result.json();
    if (!body.has_more && body.status !== 'syncing') {
      let analysisOk = false;
      try {
        const analysis = await fetch('https://autosocials.com/api/public/winner-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-winner-job-secret': req.headers.get('x-winner-job-secret')! }, body: JSON.stringify({ account_id: accountId }), signal: AbortSignal.timeout(40000) });
        analysisOk = analysis.ok;
      } catch { /* Keep the imported posts and expose the analysis gap below. */ }
      if (!analysisOk) {
        await admin.from('winner_syncs').update({ status: 'partial', message: 'Posts synced, but Sam could not update the findings. Sync again later.' }).eq('account_id', accountId).in('status', ['ready', 'partial']);
        return Response.json({ status: 'synced_analysis_failed' }, { status: 502 });
      }
    }
    return Response.json({ status: 'processed' });
  } catch { return new Response('Sync unavailable', { status: 502 }); }
});
