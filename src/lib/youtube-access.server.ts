import { requireUser, getAdminClient } from "./supabase-admin.server";

export async function requireYouTubeWorkspace(workspaceId: string) {
  const user = await requireUser();
  const sb = getAdminClient();
  const { data, error } = await sb.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (error || !data) throw new Error("You don't have access to this workspace.");
  return { user, sb };
}

/** Record only quota/audit facts, never public search queries or provider metadata. */
export async function requireYouTubeBrowseQuota(workspaceId: string, search: boolean) {
  const { user, sb } = await requireYouTubeWorkspace(workspaceId);
  // Sharing Sam's intent keeps the expensive search.list budget common to both surfaces.
  const intent = search ? "sam.search_youtube" : "youtube.browse";
  const limit = search ? 20 : 200;
  const { count, error } = await sb.from("agent_action_traces").select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).eq("intent", intent).gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if (error) throw new Error("YouTube browse usage couldn't be checked. Try again later.");
  if ((count ?? 0) >= limit) throw new Error(`This workspace has reached its ${limit} YouTube ${search ? "searches" : "browse requests"} per day. Try tomorrow.`);
  const { error: traceError } = await sb.from("agent_action_traces").insert({ workspace_id: workspaceId, user_id: user.id, intent, outcome: "requested", risk_level: "low", payload: {} });
  if (traceError) throw new Error("This YouTube browse action couldn't be recorded. Please try again.");
}

