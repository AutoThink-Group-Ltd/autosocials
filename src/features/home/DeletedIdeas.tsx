import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPersonalIdeaTrash,
  setPersonalIdeaTrash,
} from "@/lib/personal-content-ideas.functions";
import { getHomeOverview } from "@/lib/home-overview.functions";
import { restoreHomeItems } from "@/lib/home-actions.functions";

type Idea = { title: string; angle: string };

export function useDeletedIdeas(workspaceId: string, enabled: boolean) {
  const client = useQueryClient();
  const getTrash = useServerFn(getPersonalIdeaTrash);
  const save = useServerFn(setPersonalIdeaTrash);
  const query = useQuery({
    queryKey: ["personal-idea-trash", workspaceId],
    enabled,
    queryFn: () => getTrash({ data: { workspace_id: workspaceId } }),
  });
  const restore = useMutation({
    mutationFn: (idea: Idea) =>
      save({ data: { workspace_id: workspaceId, idea, trashed: false } }),
    onSuccess: async (_result, idea) => {
      client.setQueryData<{ ideas: Idea[]; needsContext: boolean }>(
        ["personal-content-ideas", workspaceId],
        (old) =>
          old
            ? {
                ...old,
                ideas: [
                  ...old.ideas.filter(
                    (item) =>
                      item.title.toLocaleLowerCase() !==
                      idea.title.toLocaleLowerCase(),
                  ),
                  idea,
                ],
              }
            : { ideas: [idea], needsContext: false },
      );
      await client.invalidateQueries({
        queryKey: ["personal-idea-trash", workspaceId],
      });
    },
  });
  return {
    query,
    items: (query.data?.ideas ?? []).map((idea) => ({
      id: `idea:${idea.title}`,
      title: idea.title,
      detail: idea.angle,
      kind: "Content idea",
      disabled: !query.data?.canEdit || restore.isPending,
      restore: () => restore.mutateAsync(idea),
    })),
  };
}

export function useDeletedHomeWork(workspaceId: string) {
  const client = useQueryClient();
  const getOverview = useServerFn(getHomeOverview);
  const restoreItems = useServerFn(restoreHomeItems);
  const query = useQuery({
    queryKey: ["home-overview", workspaceId, "trash"],
    queryFn: () =>
      getOverview({ data: { workspace_id: workspaceId, view: "trash" } }),
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const result = await restoreItems({
        data: { workspace_id: workspaceId, item_ids: [id] },
      });
      if (!result.updated_ids.includes(id))
        throw new Error(
          result.errors?.[0]?.message || "Could not restore item.",
        );
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["home-overview", workspaceId],
      });
    },
  });
  return {
    query,
    items: (query.data ?? []).map((item) => ({
      id: `home:${item.id}`,
      title: item.title,
      kind: item.status || "Work in progress",
      disabled: restore.isPending,
      restore: () => restore.mutateAsync(item.id),
    })),
  };
}
