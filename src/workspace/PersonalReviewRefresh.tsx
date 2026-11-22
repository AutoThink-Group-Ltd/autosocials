import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { collectConnectedPersonalFeeds } from "@/lib/personal-connected-feeds.functions";
import { generatePersonalBrandReport, getPersonalBrandReviewStatus } from "@/lib/personal-brand.functions";

/** Watch connections across the workspace, including while Home is not open. */
export function PersonalReviewConnectionWatcher() {
  const { currentWorkspace } = useWorkspace();
  const id = currentWorkspace?.workspace_kind === "personal" ? currentWorkspace.id : null;
  const collect = useServerFn(collectConnectedPersonalFeeds);
  const generate = useServerFn(generatePersonalBrandReport);
  const status = useServerFn(getPersonalBrandReviewStatus);
  const last = useRef("");
  const accounts = useQuery({ queryKey: ["personal-review-connections", id], enabled: !!id, refetchInterval: 30000, refetchOnWindowFocus: true, queryFn: async () => {
    const result = await supabase.from("social_accounts").select("id,platform,status,is_enabled").eq("workspace_id", id!).order("id");
    if (result.error) throw result.error;
    return JSON.stringify(result.data ?? []);
  } });
  useEffect(() => {
    if (!id || accounts.data === undefined) return;
    const signature = `${id}:${accounts.data}`;
    if (last.current === signature) return;
    last.current = signature;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      let changed = false;
      try {
        const state = await status({ data: { workspace_id: id } });
        if (cancelled || !state.canEdit) return;
        const result = await collect({ data: { workspace_id: id } });
        if (cancelled || !result.changed) return;
        changed = true;
        const queue = async () => {
          if (cancelled) return;
          const current = await status({ data: { workspace_id: id } });
          if (cancelled) return;
          if (current.status === "running") timer = setTimeout(() => { void queue().catch(() => { if (!cancelled) toast.error("Couldn’t update your personal review. Use the refresh icon to try again."); }); }, 15000);
          else await generate({ data: { workspace_id: id } });
        };
        await queue();
      } catch { if (changed && !cancelled) toast.error("Couldn’t update your personal review. Use the refresh icon to try again."); }
    };
    void start();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, accounts.data]);
  return null;
}

export function PersonalReviewRefreshButton() {
  const { currentWorkspace } = useWorkspace();
  const id = currentWorkspace?.workspace_kind === "personal" ? currentWorkspace.id : null;
  const collect = useServerFn(collectConnectedPersonalFeeds);
  const generate = useServerFn(generatePersonalBrandReport);
  const getStatus = useServerFn(getPersonalBrandReviewStatus);
  const [pending, setPending] = useState(false);
  const status = useQuery({ queryKey: ["personal-brand-review-status", id], enabled: !!id, queryFn: () => getStatus({ data: { workspace_id: id! } }), refetchInterval: (query) => query.state.data?.status === "running" ? 3000 : false });
  if (!id || !status.data?.canEdit) return null;
  const running = pending || status.data.status === "running";
  return <button type="button" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-subtle hover:text-ink disabled:opacity-50" aria-label="Run a fresh personal brand review" title="Run a fresh personal brand review" disabled={running} onClick={async () => {
    setPending(true);
    try {
      await collect({ data: { workspace_id: id, force: true } });
      await generate({ data: { workspace_id: id } });
      toast.success("Your personal brand review is updating.");
      void status.refetch();
    } catch { toast.error("Couldn’t start the review. Please try again."); }
    finally { setPending(false); }
  }}><RefreshCw size={17} className={running ? "animate-spin" : ""} /></button>;
}
