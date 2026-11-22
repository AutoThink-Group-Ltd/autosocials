import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { WorkspaceCreationScheduleDialog } from "./WorkspaceCreationScheduleDialog";
import { readScheduleDraft } from "./scheduleDraft";

export type ScheduleAddition = { tileIds?: string[]; videoIds?: string[]; writtenIds?: string[]; carouselIds?: string[]; knownPreviouslyPublished?: boolean };
export type ScheduleMode = "pane" | "dialog";
export type ScheduleCommand = { sequence: number; keys: string[]; knownPreviouslyPublished?: boolean; focus?: true };
type ScheduleContextValue = { openSchedule: (ids?: string[], videoIds?: string[], writtenIds?: string[]) => void; addToSchedule: (selection: ScheduleAddition) => void; scheduleSelection: (selection: ScheduleAddition) => void; openSchedulePane: () => void; basketCount: number };
const noOp = () => {};
const ScheduleContext = createContext<ScheduleContextValue>({ openSchedule: noOp, addToSchedule: noOp, scheduleSelection: noOp, openSchedulePane: noOp, basketCount: 0 });
export const useScheduleDialog = () => useContext(ScheduleContext);

function selectedKeys(selection: ScheduleAddition) {
  return [
    ...(selection.tileIds ?? []).map(id => `tile:${id}`),
    ...(selection.videoIds ?? []).map(id => `video:${id}`),
    ...(selection.writtenIds ?? []).map(id => `written:${id}`),
    ...(selection.carouselIds ?? []).map(id => `carousel:${id}`),
  ];
}

function WorkspaceScheduleHost({ children, userId, workspaceId }: { children: ReactNode; userId: string; workspaceId: string }) {
  const marker = `as:schedule-open:v1:${userId}:${workspaceId}`;
  const [mode, setMode] = useState<ScheduleMode | null>(null);
  const [scope, setScope] = useState(workspaceId);
  const sequence = useRef(0);
  const locked = useRef(false);
  const setLocked = useCallback((value: boolean) => { locked.current = value; }, []);
  const [basketCount, setBasketCount] = useState(0);
  const [commands, setCommands] = useState<ScheduleCommand[]>([]);

  useEffect(() => {
    const basket = readScheduleDraft(userId, workspaceId);
    setBasketCount(basket?.selected.length ?? 0);
    try {
      const saved = sessionStorage.getItem(marker);
      if (!saved) return;
      const [presentation, selectionScope] = saved.split("|");
      const targetScope = selectionScope?.startsWith(`${workspaceId}:selection:`) ? selectionScope : workspaceId;
      const draft = targetScope === workspaceId ? basket : readScheduleDraft(userId, targetScope, workspaceId);
      if (draft) {
        setScope(targetScope);
        setMode(presentation === "pane" ? "pane" : "dialog");
      }
    } catch {}
  }, [marker, userId, workspaceId]);

  function show(value: ScheduleMode | null, targetScope = scope) {
    setScope(targetScope);
    setMode(value);
    try {
      if (value) sessionStorage.setItem(marker, targetScope === workspaceId ? value : `${value}|${targetScope}`);
      else sessionStorage.removeItem(marker);
    } catch {}
  }

  function openWith(selection: ScheduleAddition, presentation: ScheduleMode, targetScope: string, focus = false) {
    if (targetScope !== scope && (locked.current || readScheduleDraft(userId, scope, workspaceId)?.uncertain)) {
      toast.error("Resolve the current scheduling request before opening another selection.");
      return;
    }
    const keys = [...new Set(selectedKeys(selection))];
    const command = keys.length ? {
      sequence: ++sequence.current, keys, ...(focus ? { focus: true as const } : {}), ...(selection.knownPreviouslyPublished ? { knownPreviouslyPublished: true } : {}),
    } : null;
    if (targetScope !== scope || command) setCommands(previous => [
      ...(targetScope === scope ? previous : []), ...(command ? [command] : []),
    ]);
    show(presentation, targetScope);
  }

  const addToSchedule = (selection: ScheduleAddition) => openWith(selection, "pane", mode ? scope : workspaceId);
  const scheduleSelection = (selection: ScheduleAddition) => {
    const keys = [...new Set(selectedKeys(selection))];
    if (!keys.length) return;
    if (keys.length > 20) {
      toast.error("Choose up to 20 posts for this schedule.");
      return;
    }
    openWith(selection, "pane", `${workspaceId}:selection:${[...keys].sort().join(",")}`, true);
  };
  const openSchedule = (tileIds: string[] = [], videoIds: string[] = [], writtenIds: string[] = []) =>
    openWith({ tileIds, videoIds, writtenIds }, "dialog", workspaceId);

  return <ScheduleContext.Provider value={{ openSchedule, addToSchedule, scheduleSelection, openSchedulePane: () => openWith({}, "pane", workspaceId), basketCount }}>{children}
    {mode && <WorkspaceCreationScheduleDialog
      key={scope}
      open mode={mode} workspaceId={workspaceId}
      selectionScope={scope === workspaceId ? undefined : scope}
      onModeChange={show}
      onOpenChange={value => { if (!value) show(null); }}
      command={commands[0] ?? null}
      onCommandHandled={id => setCommands(current => current.filter(item => item.sequence !== id))}
      onSelectionCountChange={scope === workspaceId ? setBasketCount : undefined}
      onLockChange={setLocked}
    />}
  </ScheduleContext.Provider>;
}

export function ScheduleDialogHost({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const { currentWorkspace } = useWorkspace();
  if (!user?.id || !currentWorkspace?.id) return <ScheduleContext.Provider value={{ openSchedule: noOp, addToSchedule: noOp, scheduleSelection: noOp, openSchedulePane: noOp, basketCount: 0 }}>{children}</ScheduleContext.Provider>;
  return <WorkspaceScheduleHost key={`${user.id}:${currentWorkspace.id}`} userId={user.id} workspaceId={currentWorkspace.id}>{children}</WorkspaceScheduleHost>;
}
