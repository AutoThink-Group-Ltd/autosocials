import { supabase } from "@/integrations/supabase/client";

export type ContentTrashKind = "written" | "tile" | "video" | "carousel";
export const contentTrashKey = (workspaceId: string, kind: ContentTrashKind) =>
  ["content-trash", workspaceId, kind] as const;

export async function listContentTrash(
  workspaceId: string,
  kind: ContentTrashKind,
): Promise<string[]> {
  const bucket = supabase.storage.from("brand-assets-private");
  const prefix = `${workspaceId}/home-trash/${kind}`;
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) throw error ?? new Error("Trash could not be loaded.");
    ids.push(
      ...data
        .filter((item) => /^[0-9a-f-]{36}\.json$/i.test(item.name))
        .map((item) => item.name.slice(0, -5)),
    );
    if (data.length < 1000) return ids;
  }
}

export async function setContentTrashed(
  workspaceId: string,
  kind: ContentTrashKind,
  id: string,
  trashed: boolean,
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid item.");
  const bucket = supabase.storage.from("brand-assets-private");
  const path = `${workspaceId}/home-trash/${kind}/${id}.json`;
  const result = trashed
    ? await bucket.upload(
        path,
        new Blob(["{}"], { type: "application/json" }),
        { upsert: true, contentType: "application/json" },
      )
    : await bucket.remove([path]);
  if (result.error) throw result.error;
}
