import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setNarrativeLibraryStatus } from "@/lib/creative.functions";
import { fetchAll } from "@/lib/fetch-all";
import {
  buildNarrativeLibrary,
  type LibraryBatch,
} from "@/lib/narrative-library";

/** Recover original ideas, including those cleared from the narrative library. */
export function useDeletedNarratives(workspaceId: string) {
  const client = useQueryClient();
  const updateStatus = useServerFn(setNarrativeLibraryStatus);
  const query = useQuery({
    queryKey: ["deleted-narratives", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const batches = await fetchAll<LibraryBatch>(async (from, to) => {
        const { data, error } = await supabase
          .from("creative_batches")
          .select("id,goal,created_at,narratives")
          .eq("workspace_id", workspaceId)
          .order("id")
          .range(from, to);
        return { data, error };
      });
      return buildNarrativeLibrary(batches, []).filter(
        (idea) => idea.status === "binned",
      );
    },
  });
  async function restore(idea: NonNullable<typeof query.data>[number]) {
    await updateStatus({
      data: {
        batch_id: idea.batch_id,
        narrative_id: idea.narrative_id,
        status: "available",
      },
    });
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["deleted-narratives", workspaceId],
      }),
      client.invalidateQueries({
        queryKey: ["narrative-library", workspaceId],
      }),
      client.invalidateQueries({ queryKey: ["batches", workspaceId] }),
      client.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] }),
    ]);
  }
  return {
    query,
    items: (query.data ?? []).map((idea) => ({
      id: `library:${idea.id}`,
      title: idea.title,
      kind: "Library narrative",
      restore: () => restore(idea),
    })),
  };
}
