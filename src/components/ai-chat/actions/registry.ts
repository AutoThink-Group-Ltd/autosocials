// Action protocol registry — Phase 4 of the rich agent chat.
//
// Vibe emits `actions` blocks whose `action` field is a dot-namespaced
// identifier (e.g. "outreach.send", "lists.save", "discovery.run").
// The host UI registers a handler for each id; the dispatcher resolves
// the id, runs confirmation gating when required, and invokes the handler.
//
// Handlers are pure callbacks owned by the host page — the registry never
// performs the action itself. This keeps the chat module decoupled from
// feature code and makes test substitution trivial.

import type { ActionButton } from "../types";

export type RiskLevel = "low" | "medium" | "high" | "destructive";

export interface ActionContext {
  /** Surface a toast or inline banner from the host page. */
  notify?: (msg: { title: string; description?: string; tone?: "info" | "success" | "error" }) => void;
  /** Imperative navigation hook (host injects react-router's navigate). */
  navigate?: (to: string) => void;
}

export type ActionHandlerFn = (
  payload: Record<string, unknown> | undefined,
  ctx: ActionContext,
) => void | Promise<void>;

export interface ActionDefinition {
  /** Human-readable label shown in the confirmation dialog. */
  label: string;
  /** Short sentence shown in the dialog body when confirming. */
  description?: string;
  /** When true, dispatcher always opens a confirmation dialog. */
  requiresConfirmation?: boolean;
  /** Default risk classification for this intent. Per-button risk overrides. */
  riskLevel?: RiskLevel;
  /** When true, dispatcher writes a row to `pending_agent_actions` and waits
   *  for an external approver before executing. Implies confirmation gating. */
  enqueueForApproval?: boolean;
  handler: ActionHandlerFn;
}

export class ActionRegistry {
  private map = new Map<string, ActionDefinition>();

  register(id: string, def: ActionDefinition) {
    if (this.map.has(id)) {
      // Allow override during HMR; warn so accidental dupes are visible.
      console.warn(`[ai-chat] action "${id}" re-registered`);
    }
    this.map.set(id, def);
  }

  unregister(id: string) {
    this.map.delete(id);
  }

  get(id: string): ActionDefinition | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  /**
   * Returns true when the action requires confirmation, taking into account
   * both the registry definition and the per-button override emitted by Vibe.
   * Either source can opt in — destructive intent is sticky.
   */
  shouldConfirm(button: ActionButton): boolean {
    if (button.requiresConfirmation) return true;
    if (button.riskLevel === "high" || button.riskLevel === "destructive") return true;
    const def = this.map.get(button.action);
    if (def?.riskLevel === "high" || def?.riskLevel === "destructive") return true;
    if (def?.enqueueForApproval) return true;
    return def?.requiresConfirmation === true;
  }

  /** Resolve effective risk level, button override winning over registry default. */
  riskFor(button: ActionButton): RiskLevel {
    return (button.riskLevel ?? this.map.get(button.action)?.riskLevel ?? "low") as RiskLevel;
  }
}