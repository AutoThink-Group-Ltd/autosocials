import { useCallback, useMemo, useRef, useState, type JSX } from "react";
import type { ActionButton } from "../types";
import { ActionRegistry, type ActionContext, type ActionDefinition, type RiskLevel } from "./registry";
import { ConfirmActionDialog, type PendingAction } from "./ConfirmActionDialog";
import { supabase } from "@/integrations/supabase/client";

export interface UseActionDispatcherOptions {
  /** Pre-registered handlers — typically created at module top-level. */
  registry?: ActionRegistry;
  /** Toast / banner emitter, forwarded to handlers via ActionContext. */
  notify?: ActionContext["notify"];
  /** Navigation forwarded to handlers via ActionContext. */
  navigate?: ActionContext["navigate"];
  /** Workspace id used when writing audit/approval rows. */
  workspaceId?: string | null;
  /** Disable persistence (tests / preview-only). */
  disablePersistence?: boolean;
}

export type ActionState =
  | "idle"
  | "awaiting_confirmation"
  | "awaiting_approval"
  | "pending"
  | "completed"
  | "failed";

export interface ActionStateEntry {
  state: ActionState;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface UseActionDispatcherResult {
  /** Pass to <BlockRenderer onAction={...}>. */
  onAction: (button: ActionButton) => void;
  /** Mount this once near the chat root to render the confirm modal. */
  ConfirmDialog: () => JSX.Element;
  /** Imperative register from inside components (HMR-safe). */
  register: (id: string, def: ActionDefinition) => void;
  /** Per-action state map (last invocation per action id). */
  actionStates: Record<string, ActionStateEntry>;
}

/**
 * Wires Vibe's `actions` blocks to host-page handlers, with automatic
 * confirmation gating for any button flagged `requiresConfirmation`.
 *
 * Usage:
 *   const { onAction, ConfirmDialog, register } = useActionDispatcher();
 *   register("lists.save", { label: "Save list", handler: ... });
 *   <BlockRenderer response={r} onAction={onAction} />
 *   <ConfirmDialog />
 */
export function useActionDispatcher(opts: UseActionDispatcherOptions = {}): UseActionDispatcherResult {
  // Stable registry across renders. Caller may pass their own.
  const registryRef = useRef<ActionRegistry>(opts.registry ?? new ActionRegistry());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionStateEntry>>({});
  const pendingRunRef = useRef<(() => void) | null>(null);

  const ctx: ActionContext = useMemo(
    () => ({
      ...(opts.notify !== undefined ? { notify: opts.notify } : {}),
      ...(opts.navigate !== undefined ? { navigate: opts.navigate } : {}),
    }),
    [opts.notify, opts.navigate],
  );

  const setState = useCallback((id: string, entry: ActionStateEntry) => {
    setActionStates((prev) => ({ ...prev, [id]: entry }));
  }, []);

  const trace = useCallback(
    async (intent: string, payload: unknown, risk: RiskLevel, outcome: string, error?: string, durationMs?: number) => {
      if (opts.disablePersistence) return;
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        await supabase.from("agent_action_traces" as any).insert({
          user_id: u.user.id,
          workspace_id: opts.workspaceId ?? null,
          intent,
          payload: (payload ?? {}) as any,
          risk_level: risk,
          outcome,
          error: error ?? null,
          duration_ms: durationMs ?? null,
        });
      } catch {
        /* swallow — telemetry must never break UX */
      }
    },
    [opts.disablePersistence, opts.workspaceId],
  );

  const enqueueApproval = useCallback(
    async (button: ActionButton, risk: RiskLevel) => {
      if (opts.disablePersistence) return null;
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return null;
        const { data, error } = await supabase
          .from("pending_agent_actions" as any)
          .insert({
            user_id: u.user.id,
            workspace_id: opts.workspaceId ?? null,
            intent: button.action,
            label: button.label,
            payload: (button.payload ?? {}) as any,
            risk_level: risk,
            confirmation_message: button.confirmationMessage ?? null,
            status: "pending",
          })
          .select("id")
          .single();
        if (error) throw error;
        return (data as any)?.id as string | null;
      } catch (e) {
        opts.notify?.({
          title: "Approval queue error",
          description: e instanceof Error ? e.message : "Could not enqueue",
          tone: "error",
        });
        return null;
      }
    },
    [opts],
  );

  const run = useCallback(
    async (button: ActionButton) => {
      const id = button.action;
      const def = registryRef.current.get(id);
      const risk = registryRef.current.riskFor(button);
      if (!def) {
        opts.notify?.({
          title: "Unknown action",
          description: `No handler registered for "${id}".`,
          tone: "error",
        });
        setState(id, { state: "failed", finishedAt: Date.now(), error: "no handler" });
        await trace(id, button.payload, risk, "no_handler", "Unknown action");
        return;
      }
      const startedAt = Date.now();
      setState(id, { state: "pending", startedAt });
      try {
        await def.handler(button.payload, ctx);
        const finishedAt = Date.now();
        setState(id, { state: "completed", startedAt, finishedAt });
        await trace(id, button.payload, risk, "completed", undefined, finishedAt - startedAt);
      } catch (e) {
        const finishedAt = Date.now();
        const msg = e instanceof Error ? e.message : "Unknown error";
        setState(id, { state: "failed", startedAt, finishedAt, error: msg });
        await trace(id, button.payload, risk, "failed", msg, finishedAt - startedAt);
        opts.notify?.({
          title: "Action failed",
          description: msg,
          tone: "error",
        });
      }
    },
    [ctx, opts, setState, trace],
  );

  const onAction = useCallback(
    async (button: ActionButton) => {
      const def = registryRef.current.get(button.action);
      const needsConfirm = registryRef.current.shouldConfirm(button);
      const risk = registryRef.current.riskFor(button);
      const enqueue = def?.enqueueForApproval || risk === "destructive";

      // Destructive / explicitly-enqueued intents go to the approval queue
      // and do NOT execute inline. The host's approvals UI is responsible
      // for resolution.
      if (enqueue) {
        setState(button.action, { state: "awaiting_approval", startedAt: Date.now() });
        const id = await enqueueApproval(button, risk);
        opts.notify?.({
          title: id ? "Sent for approval" : "Approval not sent",
          description: id
            ? `${button.label} is awaiting approval before it runs.`
            : "Could not enqueue this action.",
          tone: id ? "info" : "error",
        });
        await trace(button.action, button.payload, risk, "enqueued");
        return;
      }

      if (needsConfirm) {
        setState(button.action, { state: "awaiting_confirmation", startedAt: Date.now() });
        pendingRunRef.current = () => {
          void run(button);
        };
        const desc = button.confirmationMessage ?? def?.description;
        setPending({
          actionId: button.action,
          label: def?.label ?? button.label,
          ...(desc !== undefined ? { description: desc } : {}),
          ...(button.payload !== undefined ? { payload: button.payload } : {}),
        });
        return;
      }
      void run(button);
    },
    [run, setState, enqueueApproval, opts, trace],
  );

  const onConfirm = useCallback(() => {
    const fn = pendingRunRef.current;
    pendingRunRef.current = null;
    setPending(null);
    fn?.();
  }, []);

  const onCancel = useCallback(() => {
    pendingRunRef.current = null;
    setPending(null);
  }, []);

  const register = useCallback((id: string, def: ActionDefinition) => {
    registryRef.current.register(id, def);
  }, []);

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmActionDialog
        pending={pending}
        onConfirm={onConfirm}
        onCancel={onCancel}
        destructive={pending != null && /\.(send|delete|charge|publish)$/.test(pending.actionId)}
      />
    ),
    [pending, onConfirm, onCancel],
  );

  return { onAction, ConfirmDialog, register, actionStates };
}