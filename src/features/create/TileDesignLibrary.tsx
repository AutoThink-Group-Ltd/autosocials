import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listTileDesignDrafts,
  getTileDesignDraft,
} from "@/lib/tile-design-draft.functions";
import { SocialDesignEditor } from "./SocialDesignEditor";

export function TileDesignLibrary({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState("");
  if (selected)
    return (
      <OpenedDesign
        workspaceId={workspaceId}
        id={selected}
        close={() => setSelected("")}
      />
    );
  return (
    <div className="space-y-4">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer font-medium">
          Saved editable designs
        </summary>
        {expanded && (
          <DesignList workspaceId={workspaceId} select={setSelected} />
        )}
      </details>
      {children}
    </div>
  );
}

function DesignList({
  workspaceId,
  select,
}: {
  workspaceId: string;
  select: (id: string) => void;
}) {
  const list = useServerFn(listTileDesignDrafts);
  const drafts = useQuery({
    queryKey: ["editable-tiles", workspaceId],
    queryFn: () => list({ data: { workspace_id: workspaceId } }),
  });
  return (
    <div className="my-2 space-y-2">
      {drafts.isPending && <p role="status">Loading designs…</p>}
      {drafts.isError && (
        <p role="alert">Could not load this workspace’s saved designs.</p>
      )}
      {drafts.data?.length === 0 && <p>No saved designs yet.</p>}
      {drafts.data?.map((item) => (
        <button
          key={item.id}
          className="block text-left underline"
          onClick={() => select(item.id)}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

function OpenedDesign({
  workspaceId,
  id,
  close,
}: {
  workspaceId: string;
  id: string;
  close: () => void;
}) {
  const read = useServerFn(getTileDesignDraft);
  const opened = useQuery({
    queryKey: ["editable-tile", workspaceId, id],
    queryFn: () => read({ data: { workspace_id: workspaceId, id } }),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (opened.data)
    return (
      <SocialDesignEditor
        key={id}
        workspaceId={workspaceId}
        plan={opened.data.plan}
        designId={id}
        initialVersion={opened.data.version}
        storageKey={"as:tile-design:" + workspaceId + ":" + id}
        initialEntries={opened.data.entries}
        onBack={close}
      />
    );
  return (
    <div>
      <p role="status">
        {opened.isError
          ? "The saved design could not be opened."
          : "Loading design…"}
      </p>
      <button className="underline" onClick={close}>
        Back to tiles
      </button>
    </div>
  );
}
