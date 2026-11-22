// Server-side tool registry.
// Every callable tool MUST be registered here.
// Imported by the agent-tool-runner edge function.

import type { RegisteredTool } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<string, RegisteredTool<any, any>> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTool(tool: RegisteredTool<any, any>) {
  if (REGISTRY[tool.name]) {
    throw new Error(`Tool already registered: ${tool.name}`);
  }
  REGISTRY[tool.name] = tool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTool(name: string): RegisteredTool<any, any> | undefined {
  return REGISTRY[name];
}

export function listTools(): string[] {
  return Object.keys(REGISTRY);
}
