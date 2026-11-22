import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getDesignLogo,
  saveTileDesignDraft,
} from "@/lib/tile-design-draft.functions";
import type { DesignEntry } from "@/lib/tile-design-draft";
import type { TilePlan } from "@/lib/social-tiles";
export function useDesignDraft(
  workspaceId: string,
  designId?: string,
  initialVersion?: string,
) {
  const [id] = useState(() => designId ?? crypto.randomUUID());
  const version = useRef<string | undefined>(initialVersion);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const saveFn = useServerFn(saveTileDesignDraft);
  const save = (plan: TilePlan, entries: DesignEntry[]): Promise<void> => {
    const payload = structuredClone({ plan, entries });
    const run = queue.current.then(async () => {
      const result = await saveFn({
        data: {
          workspace_id: workspaceId,
          id,
          ...(version.current ? { version: version.current } : {}),
          payload,
        },
      });
      version.current = result.version;
    });
    // Do not let a failed write poison the queue; each caller still observes its own failure.
    queue.current = run.catch(() => {});
    return run;
  };
  return { id, version, save };
}
export function useDesignLogo(workspaceId: string): string | undefined {
  const get = useServerFn(getDesignLogo);
  return (
    useQuery({
      queryKey: ["tile-design-logo", workspaceId],
      queryFn: async () =>
        (await get({ data: { workspace_id: workspaceId } })) ?? null,
      enabled: !!workspaceId,
      retry: false,
    }).data ?? undefined
  );
}
