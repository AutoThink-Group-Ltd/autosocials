// Public surface for the rich agent chat module.
export * from "./types";
export { BlockRenderer } from "./BlockRenderer";
export type { BlockRendererProps } from "./BlockRenderer";
export type { ActionHandler } from "./blocks/ActionsBlock";
export { ActionRegistry } from "./actions/registry";
export type { ActionContext, ActionDefinition, ActionHandlerFn } from "./actions/registry";
export { useActionDispatcher } from "./actions/useActionDispatcher";
export type { UseActionDispatcherOptions, UseActionDispatcherResult } from "./actions/useActionDispatcher";
export { BlockSkeleton } from "./BlockSkeleton";
export { parsePartialRich } from "./streaming";
export type { PartialParseResult } from "./streaming";
export { applyCompositionGuardrails } from "./planner/compositionRules";
export type { GuardrailResult } from "./planner/compositionRules";
export type { ActionState, ActionStateEntry } from "./actions/useActionDispatcher";
export type { RiskLevel } from "./actions/registry";