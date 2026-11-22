import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { listSocialTileHistory } from "@/lib/social-tile-admin.functions";
import { engineImageLink } from "@/lib/engines.functions";
import { useAdminContentDelete, type DeletableContent } from "./AdminContentDelete";

type TileRow = { id: string; fileId: string | null; workspaceId: string; createdAt: string; status: string; workspace: unknown; title: unknown; provider: string; model: string; style: string; credits: number | null };
const deletionTarget = (row: TileRow): DeletableContent => ({ target: row.fileId ? `file:${row.fileId}` : `request:${row.id.slice(`request:${row.workspaceId}:`.length)}`, workspaceId: row.workspaceId, label: String(row.title) });
function TilePreview({ row, compact = false }: { row: TileRow; compact?: boolean }) {
  const getLink = useServerFn(engineImageLink);
  const media = useQuery({ queryKey: ["admin-social-tile-preview", row.fileId], enabled: !!row.fileId, queryFn: () => getLink({ data: { id: row.fileId! } }), staleTime: 10 * 60_000, retry: 1 });
  if (!row.fileId) return <span className="text-xs text-muted-foreground">No saved image</span>;
  if (media.isPending) return <span role="status" className="text-xs text-muted-foreground">Loading preview…</span>;
  if (media.isError) return <Button size="sm" variant="outline" onClick={() => void media.refetch()}>Retry preview</Button>;
  return <img src={media.data} alt={String(row.title)} loading="lazy" className={compact ? "h-auto max-h-28 w-28 object-contain" : "h-auto max-h-96 max-w-full object-contain"} />;
}
function TileCard({ row, deletion }: { row: TileRow; deletion: ReturnType<typeof useAdminContentDelete> }) {
  return <article className="overflow-hidden rounded-2xl border border-border-control bg-canvas"><div className="flex min-h-48 items-center justify-center bg-surface-subtle p-3"><TilePreview row={row} /></div><div className="space-y-3 p-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={deletion.isSelected(deletionTarget(row))} onChange={() => deletion.toggle(deletionTarget(row))} />Select {String(row.title)}</label><div><p className="text-xs font-semibold uppercase text-muted-foreground">{row.status}</p><h2 className="mt-1 break-words font-semibold">{String(row.title)}</h2><p className="text-xs text-muted-foreground">{String(row.workspace)}</p></div><dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Provider</dt><dd>{row.provider}</dd></div><div><dt className="text-muted-foreground">Model</dt><dd className="break-words">{row.model}</dd></div><div><dt className="text-muted-foreground">Style</dt><dd>{row.style}</dd></div><div><dt className="text-muted-foreground">Credits</dt><dd>{row.credits ?? "Unknown"}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Date</dt><dd>{new Date(row.createdAt).toLocaleString()}</dd></div></dl><Button size="sm" variant="destructive" onClick={() => deletion.deleteOne(deletionTarget(row))}>Delete</Button></div></article>;
}
export default function SocialTilesHistory() {
  const deletion = useAdminContentDelete("tile");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"gallery" | "table">("gallery");
  const history = useQuery({ queryKey: ["admin-social-tiles", page], queryFn: () => listSocialTileHistory({ data: { page } }) });
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Design requests across workspaces and providers. Credits show provider-reported units where available; unknown means no confirmed charge was returned. Earlier records may lack details.</p>
    <div className="flex gap-2" aria-label="Social tiles view"><Button size="sm" variant={view === "gallery" ? "default" : "outline"} aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>Gallery</Button><Button size="sm" variant={view === "table" ? "default" : "outline"} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</Button></div>
    {history.isLoading && <p>Loading social tile history…</p>}
    {history.isError && <p role="alert">Social tile history could not be loaded.</p>}
    {history.data && <>
      {deletion.toolbar(history.data.rows.map(deletionTarget))}
      {history.data.rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No design requests found.</p> : view === "gallery" ? <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{history.data.rows.map(row => <TileCard key={row.id} row={row} deletion={deletion} />)}</div> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[1000px] text-left text-sm"><thead><tr className="bg-muted">{["Select", "Preview", "Date", "Workspace", "Design", "Status", "Provider", "Model", "Style", "Credits", "Delete"].map(label => <th className="p-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{history.data.rows.map(row => <tr className="border-t border-border" key={row.id}><td className="p-3"><input type="checkbox" aria-label={`Select ${String(row.title)}`} checked={deletion.isSelected(deletionTarget(row))} onChange={() => deletion.toggle(deletionTarget(row))} /></td><td className="p-3"><TilePreview row={row} compact /></td><td className="whitespace-nowrap p-3">{new Date(row.createdAt).toLocaleString()}</td><td className="p-3">{String(row.workspace)}</td><td className="p-3">{String(row.title)}</td><td className="p-3">{row.status}</td><td className="p-3">{row.provider}</td><td className="p-3">{row.model}</td><td className="p-3">{row.style}</td><td className="p-3">{row.credits ?? "Unknown"}</td><td className="p-3"><Button size="sm" variant="destructive" onClick={() => deletion.deleteOne(deletionTarget(row))}>Delete</Button></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between text-sm"><span>{history.data.total} requests</span><div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" disabled={(page + 1) * 30 >= history.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    </>}
    {deletion.dialog}
  </div>;
}
