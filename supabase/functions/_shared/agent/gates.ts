// Confirmation gate enforcement.
// Used by the runner before invoking any tool whose
// requiresConfirmation != 'none'.

import type { ConfirmationRequirement, ToolContext, ToolResult } from "./types.ts";

export function checkConfirmation(
  requirement: ConfirmationRequirement,
  ctx: ToolContext,
  rawInput: unknown,
): ToolResult<null> | null {
  if (requirement === "none") return null;

  if (!ctx.confirmed) {
    return {
      ok: false,
      error: {
        code: "confirmation_required",
        message:
          requirement === "explicit_typed_confirmation"
            ? "This action requires explicit typed confirmation. Re-invoke with confirmed=true after the user types confirmation."
            : "This action requires user confirmation. Re-invoke with confirmed=true after the user approves.",
        details: { requirement, preview: rawInput },
      },
    };
  }
  return null;
}
