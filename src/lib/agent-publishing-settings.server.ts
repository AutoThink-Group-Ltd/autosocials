import { getAgentDb } from "./agent-access-db.server";

export async function listAgentPublishingPolicies(workspaceId: string) {
  return getAgentDb()
    .from("agent_publishing_policies")
    .select(
      "id,connection_id,account_ids,expires_at,max_count,publish_now_account_ids,publish_now_max_count,revoked_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
}
