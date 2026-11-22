import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext } from "react";
import { getFilePreviews, type FilePreview } from "@/lib/studio.functions";

export const StudioCtx = createContext<{ workspaceId: string | null; previews: Map<string, FilePreview>; loading: boolean; open: (ids: string[], at: string) => void }>({
  workspaceId: null, previews: new Map(), loading: false, open: () => {},
});
export const useStudio = () => useContext(StudioCtx);

/** One batched fetch for every file the canvas shows; links refresh every 50 minutes. */
export function usePreviewMap(workspaceId: string | null | undefined, ids: string[]) {
  const fetchFn = useServerFn(getFilePreviews);
  const key = [...ids].sort().join(",");
  const q = useQuery({
    queryKey: ["file-previews", workspaceId, key],
    enabled: !!workspaceId && ids.length > 0,
    staleTime: 50 * 60_000,
    queryFn: () => fetchFn({ data: { workspace_id: workspaceId!, file_ids: ids.slice(0, 60) } }),
  });
  return { previews: new Map((q.data ?? []).map((p) => [p.id, p])), loading: q.isLoading };
}
