export type TileOperation = { workspace_id: string; signature: string; status: string; result: any; created_at: string };
export type SavedTile = { id: string; workspace_id: string; name: string | null; created_at: string };
/** Merge unlinked saved tiles into request history without claiming an unrecorded provider. */
export function mergeSocialTileHistory(operations: TileOperation[], files: SavedTile[]) {
  const fileByScope = new Map(files.map(file => [`${file.workspace_id}:${file.id}`, file]));
  const claimed = new Set<string>();
  const all = operations.map(row => {
    const scope = `${row.workspace_id}:${row.result?.file_id ?? ""}`;
    const file = fileByScope.get(scope);
    if (file) claimed.add(scope);
    return { id: `request:${row.workspace_id}:${row.signature}`, fileId: file?.id ?? null, workspaceId: row.workspace_id, createdAt: row.created_at, status: row.status,
      title: file?.name ?? "Design request", provider: typeof row.result?.provider === "string" ? row.result.provider : "Unknown", model: typeof row.result?.model === "string" ? row.result.model : "Unknown", style: typeof row.result?.style === "string" ? row.result.style : "Unknown", credits: typeof row.result?.credits === "number" && Number.isFinite(row.result.credits) && row.result.credits >= 0 ? row.result.credits : null };
  });
  for (const file of files) if (!claimed.has(`${file.workspace_id}:${file.id}`)) all.push({ id: `file:${file.workspace_id}:${file.id}`, fileId: file.id, workspaceId: file.workspace_id, createdAt: file.created_at, status: "saved", title: file.name ?? "Social tile", provider: "Unknown", model: "Unknown", style: "Unknown", credits: null });
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
