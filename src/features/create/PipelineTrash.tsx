import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listPipelineTrash,
  pipelineTrashKey,
  setPipelineTrashed,
} from "@/lib/pipeline-trash";

export function usePipelineTrash(workspaceId: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: pipelineTrashKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: () => listPipelineTrash(workspaceId),
  });
  const bulkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      let failed = 0;
      for (let i = 0; i < ids.length; i += 5) {
        const results = await Promise.allSettled(
          ids
            .slice(i, i + 5)
            .map((id) => setPipelineTrashed(workspaceId, id, true)),
        );
        failed += results.filter(
          (result) => result.status === "rejected",
        ).length;
      }
      if (failed)
        throw new Error(
          `Couldn’t move ${failed} selected plan${failed === 1 ? "" : "s"} to Trash. Try again.`,
        );
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: pipelineTrashKey(workspaceId) }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, trashed }: { id: string; trashed: boolean }) =>
      setPipelineTrashed(workspaceId, id, trashed),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: pipelineTrashKey(workspaceId),
      });
    },
  });
  return {
    ids: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    setTrashed: (id: string, trashed: boolean) =>
      mutation.mutateAsync({ id, trashed }),
    trashPlans: bulkMutation.mutateAsync,
    isPending: mutation.isPending || bulkMutation.isPending,
    refetch: query.refetch,
  };
}

/** Only a marker is changed. This never cancels a job or a scheduled delivery. */
export function PipelineTrashAction({
  title,
  trashed,
  disabled,
  onChange,
  bulk = false,
  readyAsset = false,
  tile = false,
  returnToPlan = false,
  carousel = false,
}: {
  title: string;
  bulk?: boolean;
  readyAsset?: boolean;
  tile?: boolean;
  returnToPlan?: boolean;
  carousel?: boolean;
  trashed: boolean;
  disabled?: boolean;
  onChange: (trashed: boolean) => Promise<unknown>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onChange(next);
      setConfirm(false);
    } catch (cause) {
      setError(
        bulk && cause instanceof Error
          ? cause.message
          : next
            ? "Couldn’t move this item to Trash. Try again."
            : "Couldn’t restore this item. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const action = returnToPlan
    ? "Return to Plans"
    : trashed
    ? "Restore"
    : carousel
      ? "Move carousel to bin"
    : readyAsset
      ? "Delete asset"
      : tile
        ? bulk ? "Trash selected tiles" : "Trash tile"
        : "Delete plan";
  const buttonText = bulk ? `Move ${title} to Trash` : action;
  const excerpt =
    title.length > 180 ? `${title.slice(0, 180).trimEnd()}…` : title;
  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => (trashed ? void update(false) : setConfirm(true))}
        className="inline-flex items-center gap-1 rounded-lg p-2 text-sm font-semibold hover:bg-surface-subtle disabled:opacity-50"
        title={bulk ? buttonText : action}
        aria-label={bulk ? buttonText : `${action} ${excerpt}`}
      >
        {busy ? (
          "Saving…"
        ) : trashed ? (
          buttonText
        ) : (
          <>
            <Trash2 className="size-4" aria-hidden />
            {(readyAsset || bulk) && buttonText}
          </>
        )}
      </button>
      {error && !confirm && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) setConfirm(open);
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {bulk ? `Move ${title} to Trash?` : `${action}?`}
            </AlertDialogTitle>
            {!bulk && (
              <p className="max-h-24 overflow-y-auto break-words text-sm text-muted-foreground">
                {excerpt}
              </p>
            )}
            <AlertDialogDescription>
              {returnToPlan
                ? "The plan will return to Plans. Existing designs remain available, and work already in progress will continue."
                : tile
                ? "You can restore tiles from Settings > Deleted Items. Any artwork already saved remains available."
                : readyAsset
                ? "You can restore this asset from Settings > Deleted Items."
                : bulk
                  ? "You can restore these plans from Settings > Deleted Items. Created assets stay available, scheduled posts keep their bookings, and published posts stay live."
                  : "You can restore this item from Settings > Deleted Items. Work already in progress and scheduled publishing will continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void update(true);
              }}
            >
              {action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
