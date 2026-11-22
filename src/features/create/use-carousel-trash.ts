import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contentTrashKey, listContentTrash, setContentTrashed } from "@/lib/content-trash";
import { listPipelineTrash, pipelineTrashKey, setPipelineTrashed } from "@/lib/pipeline-trash";

export function useCarouselTrash(workspaceId: string, assetView = false) {
  const client = useQueryClient();
  const queryKey = assetView ? contentTrashKey(workspaceId, "carousel") : pipelineTrashKey(workspaceId);
  const trash = useQuery({
    queryKey,
    enabled: !!workspaceId,
    queryFn: () => assetView ? listContentTrash(workspaceId, "carousel") : listPipelineTrash(workspaceId),
  });
  return {
    isLoading: trash.isPending,
    isError: trash.isError,
    includes: (id: string) => !!trash.data?.includes(assetView ? id : `carousel:${id}`),
    retry: trash.refetch,
    moveToBin: async (id: string) => {
      if (assetView) await setContentTrashed(workspaceId, "carousel", id, true);
      else await setPipelineTrashed(workspaceId, `carousel:${id}`, true);
      await client.invalidateQueries({ queryKey });
    },
  };
}
