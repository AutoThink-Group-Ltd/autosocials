import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** RLS limits this operational feed to super admins. */
export function ScheduleFailureAlerts() {
  const query = useQuery({ queryKey: ["admin-schedule-failures"], refetchInterval: 60_000, queryFn: async () => {
    const result = await (supabase.from("creation_schedule_failure_events" as never) as any).select("id,workspace_id,request_id,stage,category,occurred_at").order("occurred_at", { ascending: false }).limit(50);
    if (result.error) throw result.error;
    return result.data as Array<{ id: string; workspace_id: string; request_id: string; stage: string; category: string; occurred_at: string }>;
  } });
  return <section className="rounded-xl border bg-surface p-4" aria-label="Scheduling failure alerts"><h2 className="font-semibold">Scheduling failure alerts</h2><p className="text-sm text-muted-foreground">Recent scheduling errors for support. Details are categorised to protect private content.</p>{query.isPending ? <p>Loading alerts…</p> : query.isError ? <p role="alert">Could not load scheduling alerts.</p> : !query.data?.length ? <p className="mt-2 text-sm">No scheduling failures recorded.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Time</th><th>Category</th><th>Stage</th><th>Workspace</th><th>Request</th></tr></thead><tbody>{query.data.map(row => <tr key={row.id} className="border-t"><td className="py-2">{new Date(row.occurred_at).toLocaleString()}</td><td>{row.category}</td><td>{row.stage}</td><td>{row.workspace_id}</td><td>{row.request_id}</td></tr>)}</tbody></table></div>}</section>;
}
