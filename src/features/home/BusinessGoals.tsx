import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBusinessGoals, saveBusinessGoals } from "@/lib/business-goals.functions";
import { Button } from "@/components/ui/button";

export function BusinessGoals({ workspaceId }: { workspaceId: string }) {
  const getGoals = useServerFn(getBusinessGoals), saveGoals = useServerFn(saveBusinessGoals);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["business-goals", workspaceId], queryFn: () => getGoals({ data: { workspace_id: workspaceId } }) });
  const save = useMutation({ mutationFn: (data: { knownFor: string; audience: string; goal: string }) => saveGoals({ data: { workspace_id: workspaceId, ...data } }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["business-goals", workspaceId] }); } });
  return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-display text-xl font-bold">Where your business wants to go</h2><p className="mt-2 text-sm text-muted-foreground">Tell Sam what your business wants to be known for, who you want to reach and what you want to achieve. These goals are included in your brand context for future work.</p>{query.isPending ? <p role="status">Loading goals…</p> : query.isError ? <p role="alert">Couldn’t load business goals.</p> : <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ knownFor: String(data.get("knownFor") || ""), audience: String(data.get("audience") || ""), goal: String(data.get("goal") || "") }); }}>
    <label className="block text-sm font-medium">What should your business be known for?<textarea name="knownFor" maxLength={1000} defaultValue={query.data.knownFor} disabled={!query.data.canEdit} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3" /></label>
    <label className="block text-sm font-medium">Who do you want to reach?<textarea name="audience" maxLength={1000} defaultValue={query.data.audience} disabled={!query.data.canEdit} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3" /></label>
    <label className="block text-sm font-medium">What is your main business goal?<textarea name="goal" maxLength={1000} defaultValue={query.data.goal} disabled={!query.data.canEdit} className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-3" /></label>
    {query.data.canEdit ? <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save goals"}</Button> : <p className="text-sm text-muted-foreground">A workspace manager can edit these goals.</p>}{save.isSuccess && <p role="status" className="text-sm">Business goals saved.</p>}{save.isError && <p role="alert" className="text-sm text-destructive">Couldn’t save business goals.</p>}
  </form>}</section>;
}
