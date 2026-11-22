# AI Chat Rendering — AutoThink OS Foundation

The reusable rich-rendering layer for AutoThink OS agent chat. This folder is
designed to be lifted into any AutoThink-built application without
modification.

## Architecture

```
User intent
  → Agent reasoning (LLM, see prompts/vibe-chat.ts)
  → Presentation planning (model + planner/presentationPlanner.ts)
  → Structured response (RichResponseSchema)
  → Block validation (Zod, parseRichResponse / parsePartialRich)
  → Composition guardrails (planner/compositionRules.ts)
  → BlockRenderer registry → block views
  → Action protocol (actions/useActionDispatcher.tsx)
  → State update + audit trace
```

## Folder layout

| Concern | File |
|---|---|
| Schema (Zod + types) | `types.ts` |
| Streaming-tolerant parser | `streaming.ts` |
| Top-level renderer + registry | `BlockRenderer.tsx` |
| Skeleton placeholder | `BlockSkeleton.tsx` |
| Block views | `blocks/*.tsx`, `blocks/extra-blocks.tsx`, `blocks/portability-blocks.tsx` |
| Action protocol | `actions/registry.ts`, `actions/useActionDispatcher.tsx`, `actions/ConfirmActionDialog.tsx` |
| Planner | `planner/presentationPlanner.ts`, `planner/compositionRules.ts` |
| Demo harness | `demo/demoScenarios.ts` (consumed by `pages/app/AgentChatDemoPage.tsx`) |
| Tests | `__tests__/*.test.{ts,tsx}` |

## Schema reference

The wire format is a single Zod-validated `RichResponse`:

```ts
{
  v: 1,
  summary?: string,
  messageId?: string,
  presentationType?:
    | "plain_text" | "answer_with_evidence" | "kpi_summary"
    | "smart_table" | "chart_summary" | "comparison" | "timeline"
    | "source_breakdown" | "preview" | "form_request" | "action_panel"
    | "workflow_status" | "mixed_response",
  metadata?: {
    confidence?: "low" | "medium" | "high",
    dataFreshness?: string,
    sourcesUsed?: string[],
    sourcesUnavailable?: string[],
    isPartialAnswer?: boolean,
    requiresUserConfirmation?: boolean,
    fallbackText?: string
  },
  blocks: Block[]   // 1..40
}
```

The model emits this inside a fenced code block:

```text
```vibe-rich
{ "v": 1, "blocks": [ ... ] }
```
```

`streaming.ts` tolerates partially-emitted envelopes and returns whichever
blocks have validated so far, dropping any in-flight trailing block. The
renderer appends a `BlockSkeleton` while `isStreaming` is true.

## Block catalogue (35 types)

Informational: `text`, `heading`, `list`, `key_value`, `stat`, `chart`,
`table`, `creator_card`, `callout`, `divider`, `answer_evidence`,
`kpi_cards`, `multi_source_view`, `timeline_snapshot`,
`data_quality_panel`.

Comparison & history: `comparison_strip`, `drill_down`.

Previews: `message_preview`, `email_preview`, `record_preview`,
`task_preview`, `document_preview`, `file_preview`, `report_preview`.

Input: `form` (kinds: text, textarea, select, multi_select, date, number,
toggle, checkbox).

Action / workflow: `actions`, `action_row`, `next_best_action`,
`approval_card`, `checklist`, `status_panel`, `workflow_steps`.

States: `empty_state`, `error_state`, `loading_state`.

Unknown types render nothing (never crash) — see `BlockSwitch` default arm.

## Adding a new block

1. Add a Zod schema + inferred type in `types.ts`.
2. Append it to the `BlockSchema` discriminated union and export the inferred
   type at the bottom of the file.
3. Build a small view in `blocks/` (use semantic Tailwind tokens — never raw
   colours).
4. Wire it into `BlockSwitch` in `BlockRenderer.tsx`.
5. Add a scenario to `demo/demoScenarios.ts`.
6. Mention it under the appropriate section in this doc.

## Adding a new action intent

1. Pick a dot-namespaced id, e.g. `outreach.send`.
2. Register a handler at the host page:

   ```ts
   const { register, ConfirmDialog, onAction } = useActionDispatcher({
     workspaceId: ws?.id, notify, navigate,
   });
   register("outreach.send", {
     label: "Send outreach",
     description: "Send the drafted message to the selected creator.",
     riskLevel: "high",     // → triggers approval modal
     // enqueueForApproval: true,  // → writes to pending_agent_actions queue
     handler: async (payload, ctx) => { /* call your tool */ },
   });
   ```
3. Vibe references the same id in `ActionButton.action`. Confirmation,
   approval queue, audit trace and state machine are automatic.
4. State machine: `idle → awaiting_confirmation | awaiting_approval → pending → completed | failed`.

## Risk policy

| Risk level | Behaviour |
|---|---|
| `low` | Runs immediately. |
| `medium` | Runs immediately; confirmation modal if button or registry asks. |
| `high` | Confirmation modal mandatory. |
| `destructive` | Always queued to `pending_agent_actions`; resolved by the Agent Approvals page. |

## Reusing this folder in another AutoThink app

1. Copy `src/components/ai-chat/` and `src/pages/app/AgentChatDemoPage.tsx` and
   `src/pages/app/AgentApprovalsPage.tsx`.
2. Bring the migration that creates `pending_agent_actions` and
   `agent_action_traces` tables (see `supabase/migrations/`).
3. Replace `prompts/vibe-chat.ts` with that app's system prompt — preserve
   the rich-envelope contract section verbatim.
4. Mount the demo route at `/admin/agent-chat-demo` and the approvals route
   at `/admin/approvals` for super-admins.
5. Register handlers for the intents your app actually exposes; everything
   else degrades gracefully.

No host-app coupling exists inside this folder beyond `@/integrations/supabase/client`
and `@/components/ui/*` — both already standard in AutoThink apps.