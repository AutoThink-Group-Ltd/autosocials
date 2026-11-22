import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPickableFiles } from "@/lib/studio.functions";

export function DesignReferencePicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = useServerFn(listPickableFiles);
  const files = useQuery({
    queryKey: ["design-references", workspaceId],
    queryFn: () => list({ data: { workspace_id: workspaceId } }),
    enabled: open && !!workspaceId,
  });
  const images = files.data?.filter(
    (file) => file.kind === "image" || file.kind === "logo",
  );
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">
        Style references · {value.length} selected
      </summary>
      {open && (
        <fieldset className="mt-2 max-h-48 space-y-2 overflow-auto">
          <legend className="text-xs text-muted-foreground">
            Choose up to five workspace images
          </legend>
          {files.isPending && <p role="status">Loading images…</p>}
          {files.isError && (
            <p role="alert">Workspace images could not be loaded.</p>
          )}
          {images?.length === 0 && <p>No images in this workspace yet.</p>}
          {images?.map((file) => (
            <label key={file.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.includes(file.id)}
                disabled={!value.includes(file.id) && value.length >= 5}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, file.id]
                      : value.filter((id) => id !== file.id),
                  )
                }
              />
              {file.name}
            </label>
          ))}
        </fieldset>
      )}
    </details>
  );
}
