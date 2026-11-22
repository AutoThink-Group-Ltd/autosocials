import { supabase } from "@/integrations/supabase/client";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const prefix =
  /^(?:canvas|batch|personal|narrative|campaign|campaign-production|carousel|production-item):/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Marker names contain the whole entry key, not just a source UUID: a plan,
 * its narratives and its production can therefore be restored independently. */
function markerName(id: string): string {
  const bytes = encoder.encode(id);
  if (!prefix.test(id) || bytes.length > 120 || bytes.length === 0)
    throw new Error("Invalid pipeline item.");
  return (
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") +
    ".json"
  );
}
function markerId(name: string): string | null {
  if (!/^(?:[0-9a-f]{2}){1,120}\.json$/i.test(name)) return null;
  try {
    const bytes = name
      .slice(0, -5)
      .match(/../g)!
      .map((pair) => parseInt(pair, 16));
    const id = decoder.decode(new Uint8Array(bytes));
    return markerName(id).toLowerCase() === name.toLowerCase() ? id : null;
  } catch {
    return null;
  }
}
function markerPrefix(workspaceId: string) {
  if (!uuid.test(workspaceId)) throw new Error("Invalid workspace.");
  return `${workspaceId}/pipeline-trash`;
}
export const pipelineTrashKey = (workspaceId: string) =>
  ["pipeline-trash", workspaceId] as const;

export async function listPipelineTrash(
  workspaceId: string,
): Promise<string[]> {
  const folder = markerPrefix(workspaceId);
  const bucket = supabase.storage.from("brand-assets-private");
  const result: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) throw error ?? new Error("Trash could not be loaded.");
    result.push(
      ...data.flatMap((item) => {
        const id = markerId(item.name);
        return id === null ? [] : [id];
      }),
    );
    if (data.length < 1000) return result;
  }
}

export async function setPipelineTrashed(
  workspaceId: string,
  id: string,
  trashed: boolean,
): Promise<void> {
  const path = `${markerPrefix(workspaceId)}/${markerName(id)}`;
  const bucket = supabase.storage.from("brand-assets-private");
  const result = trashed
    ? await bucket.upload(
        path,
        new Blob(["{}"], { type: "application/json" }),
        { upsert: true, contentType: "application/json" },
      )
    : await bucket.remove([path]);
  if (result.error) throw result.error;
}

// A returned production run remains intact; this marker controls only its location.
export async function listReturnedTilePlans(workspaceId: string): Promise<string[]> {
  const folder = `${markerPrefix(workspaceId)}-returned`;
  const bucket = supabase.storage.from("brand-assets-private");
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) throw error ?? new Error("Returned plans could not be loaded.");
    ids.push(...data.flatMap(item => { const id = markerId(item.name); return id?.startsWith("canvas:") ? [id] : []; }));
    if (data.length < 1000) return ids;
  }
}
export async function setTilePlanReturned(workspaceId: string, id: string, returned: boolean): Promise<void> {
  if (!id.startsWith("canvas:")) throw new Error("Invalid tile plan.");
  const path = `${markerPrefix(workspaceId)}-returned/${markerName(id)}`;
  const bucket = supabase.storage.from("brand-assets-private");
  const result = returned ? await bucket.upload(path, new Blob(["{}"], { type: "application/json" }), { upsert: true, contentType: "application/json" }) : await bucket.remove([path]);
  if (result.error) throw result.error;
}
