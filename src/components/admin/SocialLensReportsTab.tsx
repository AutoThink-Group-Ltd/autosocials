import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAdminSocialLensReports,
  getAdminSocialLensReport,
  moveAdminSocialLensReport,
  type AdminSocialLensRow,
} from "@/lib/admin-social-lens.functions";

type ReportRow = AdminSocialLensRow;
const PAGE_SIZE = 25;
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString("en-GB");
};
const errorLabel = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

function ReportData({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {JSON.stringify(value, null, 2) ?? "No data"}
      </pre>
    </details>
  );
}

export default function SocialLensReportsTab() {
  const listReports = useServerFn(listAdminSocialLensReports);
  const getReport = useServerFn(getAdminSocialLensReport);
  const moveReport = useServerFn(moveAdminSocialLensReport);
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [moving, setMoving] = useState<ReportRow | null>(null);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [revokeShares, setRevokeShares] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reports = useQuery({
    queryKey: ["admin-social-lens", workspaceId, search, page],
    queryFn: () =>
      listReports({
        data: {
          workspaceId: workspaceId === "all" ? null : workspaceId,
          search,
          page: page - 1,
        },
      }),
  });
  const detail = useQuery({
    queryKey: ["admin-social-lens-report", detailId],
    queryFn: () => getReport({ data: { runId: detailId! } }),
    enabled: !!detailId,
  });
  const totalPages = Math.max(
    1,
    Math.ceil((reports.data?.total ?? 0) / PAGE_SIZE),
  );
  const workspaces = reports.data?.workspaces ?? [];

  const startMove = (row: ReportRow) => {
    setMoving(row);
    setTargetWorkspaceId("");
    setRevokeShares(false);
    setMoveError(null);
    setNotice(null);
  };
  const submitMove = async () => {
    if (
      !moving ||
      !targetWorkspaceId ||
      targetWorkspaceId === moving.workspaceId ||
      saving
    )
      return;
    setSaving(true);
    setMoveError(null);
    try {
      const result = await moveReport({
        data: {
          runId: moving.id,
          expectedWorkspaceId: moving.workspaceId,
          targetWorkspaceId,
          revokeShares,
        },
      });
      const targetName =
        workspaces.find((workspace) => workspace.id === targetWorkspaceId)
          ?.name ?? "the selected workspace";
      setNotice(
        `Report moved to ${targetName}. ${result.revokedShareCount} public share link${result.revokedShareCount === 1 ? "" : "s"} revoked.`,
      );
      setMoving(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-social-lens"] }),
        queryClient.invalidateQueries({
          queryKey: ["admin-social-lens-report", moving.id],
        }),
      ]);
    } catch (error) {
      setMoveError(errorLabel(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Social Lens reports</h2>
          <p className="text-sm text-muted-foreground">
            Review reports across workspaces and move them to the correct
            workspace.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void reports.refetch()}
          disabled={reports.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select
          value={workspaceId}
          onValueChange={(value) => {
            setWorkspaceId(value);
            setPage(1);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-64"
            aria-label="Filter by workspace"
          >
            <SelectValue placeholder="All workspaces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workspaces</SelectItem>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <Input
            aria-label="Search Social Lens reports"
            placeholder="Search reports…"
            maxLength={120}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {reports.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorLabel(reports.error)}
        </p>
      )}
      <div
        className="overflow-x-auto rounded-xl border border-border bg-card"
        aria-busy={reports.isFetching}
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {[
                "Report",
                "Workspace / creator",
                "Status",
                "Created",
                "Posts / shares",
                "Actions",
              ].map((label) => (
                <th key={label} scope="col" className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.isPending && (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-muted-foreground"
                >
                  Loading reports…
                </td>
              </tr>
            )}
            {reports.data?.rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-muted-foreground"
                >
                  No reports match these filters.
                </td>
              </tr>
            )}
            {reports.data?.rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="max-w-sm px-4 py-3">
                  <div className="line-clamp-2 font-medium">
                    {row.query || "Untitled report"}
                  </div>
                  {row.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.summary}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div>{row.workspaceName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.creatorName || "Unknown creator"}
                  </div>
                </td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  {dateLabel(row.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div>{row.postCount} posts</div>
                  <div className="text-xs text-muted-foreground">
                    {row.activeShareCount} active shares
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailId(row.id)}
                      aria-label={`View report: ${row.query}`}
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startMove(row)}
                      aria-label={`Move report: ${row.query}`}
                    >
                      <ArrowRightLeft className="mr-1 h-4 w-4" />
                      Move
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {reports.data?.total ?? 0} reports · Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || reports.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              page >= totalPages || reports.isFetching || reports.isError
            }
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Social Lens report</DialogTitle>
            <DialogDescription>
              Report content and its current workspace.
            </DialogDescription>
          </DialogHeader>
          {detail.isPending && (
            <p className="text-sm text-muted-foreground">Loading report…</p>
          )}
          {detail.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorLabel(detail.error)}
            </p>
          )}
          {detail.data && (
            <div className="min-w-0 space-y-4">
              <div>
                <h3 className="break-words font-semibold">
                  {detail.data.query}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.data.workspaceName} · {detail.data.status} ·{" "}
                  {dateLabel(detail.data.createdAt)}
                </p>
              </div>
              {detail.data.question && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Question</h4>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {detail.data.question}
                  </p>
                </div>
              )}
              {detail.data.reply && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Report</h4>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {detail.data.reply}
                  </p>
                </div>
              )}
              <ReportData title="Analysis" value={detail.data.analysis} />
              <ReportData
                title={`Targets (${detail.data.targets.length})`}
                value={detail.data.targets}
              />
              <ReportData
                title={`Posts (${detail.data.posts.length})`}
                value={detail.data.posts}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!moving}
        onOpenChange={(open) => {
          if (!open && !saving) setMoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Social Lens report</DialogTitle>
            <DialogDescription>
              Moving changes which workspace can access this report. The
              original creator remains unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="break-words font-medium">
                {moving?.query || "Untitled report"}
              </p>
              <p className="mt-1 text-muted-foreground">
                From: {moving?.workspaceName}
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="social-lens-target"
                className="text-sm font-medium"
              >
                Target workspace
              </label>
              <Select
                value={targetWorkspaceId}
                onValueChange={setTargetWorkspaceId}
                disabled={saving}
              >
                <SelectTrigger id="social-lens-target">
                  <SelectValue placeholder="Choose a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces
                    .filter((workspace) => workspace.id !== moving?.workspaceId)
                    .map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Existing public share links stay active after moving, unless you
              choose to revoke them below.
            </p>
            <div className="flex items-start gap-2">
              <Checkbox
                id="social-lens-revoke"
                checked={revokeShares}
                onCheckedChange={(checked) => setRevokeShares(checked === true)}
                disabled={saving}
              />
              <label
                htmlFor="social-lens-revoke"
                className="cursor-pointer text-sm"
              >
                Revoke all existing public share links (
                {moving?.activeShareCount ?? 0} active)
              </label>
            </div>
            {moveError && (
              <p role="alert" className="text-sm text-destructive">
                {moveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setMoving(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !targetWorkspaceId ||
                targetWorkspaceId === moving?.workspaceId ||
                saving
              }
              onClick={() => void submitMove()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Moving…" : "Move report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
