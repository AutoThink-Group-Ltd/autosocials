import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Tracks monthly usage counts for the current workspace.
 * Returns current counts for searches, emails, vibe conversations, etc.
 */
export function useUsageCounts() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["usage-counts", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return defaultCounts;

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Run all counts in parallel
      const [searchesRes, emailsRes, vibeRes, listsRes, savedRes] = await Promise.all([
        // Searches this month
        supabase
          .from("search_queries")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .gte("searched_at", monthStart),
        // Emails sent this month
        supabase
          .from("email_send_log")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .gte("sent_at", monthStart),
        // Vibe conversations this month
        supabase
          .from("vibe_conversations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .gte("created_at", monthStart),
        // Total creator lists
        supabase
          .from("creator_lists")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        // Total saved creators (via list_members)
        supabase
          .from("list_members")
          .select("id, creator_lists!inner(workspace_id)", { count: "exact", head: true })
          .eq("creator_lists.workspace_id", workspaceId),
      ]);

      return {
        searches: searchesRes.count ?? 0,
        emails: emailsRes.count ?? 0,
        vibe_conversations: vibeRes.count ?? 0,
        creator_lists: listsRes.count ?? 0,
        saved_creators: savedRes.count ?? 0,
        enrichments: 0, // TODO: track when enrichment tracking is added
        content_calls: 0, // TODO: track when content call tracking is added
      };
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    counts: data ?? defaultCounts,
    isLoading,
    refetch,
  };
}

const defaultCounts = {
  searches: 0,
  emails: 0,
  vibe_conversations: 0,
  creator_lists: 0,
  saved_creators: 0,
  enrichments: 0,
  content_calls: 0,
};
