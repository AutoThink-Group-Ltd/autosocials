import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId?: string | null;
  name?: string | null;
  className?: string;
}

/** Client company logo (from the client workspace), falling back to its initial. */
export function ClientAvatar({ workspaceId, name, className }: Props) {
  const { workspaces } = useWorkspace();
  const logo = workspaceId ? workspaces.find((w) => w.id === workspaceId)?.logo_url : null;
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = !!logo && failed !== logo;

  return (
    <div className={cn("w-10 h-10 shrink-0 overflow-hidden rounded-lg bg-secondary flex items-center justify-center text-sm font-semibold text-foreground", className)}>
      {showLogo ? (
        <img src={logo!} alt={name ? `${name} logo` : ""} className="h-full w-full object-cover" onError={() => setFailed(logo!)} />
      ) : (
        (name?.trim().charAt(0) || "?").toUpperCase()
      )}
    </div>
  );
}
