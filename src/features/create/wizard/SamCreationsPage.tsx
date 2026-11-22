import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AssetManager } from "./AssetManager";

export function SamCreationsPage() {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const ws = currentWorkspace?.id;

  if (!ws) {
    return (
      <main className="min-h-full bg-surface p-4 md:p-6">
        <div className="mx-auto max-w-3xl rounded-[14px] border-2 border-ink bg-canvas p-8 text-center">
          <h1 className="font-display text-[24px] font-bold">Sam’s creations</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Choose a business from the menu to see its assets.</p>
        </div>
      </main>
    );
  }

  return (
    <AssetManager
      ws={ws}
      onPick={(id) => {
        void navigate({ to: "/app/create", search: { wizard: "video", batch: id, stage: "plans" } });
      }}
      onChanged={async () => undefined}
    />
  );
}
