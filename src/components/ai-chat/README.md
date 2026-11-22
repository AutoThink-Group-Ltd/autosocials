# Rich Agent Chat (Vibe)

Implements **AutoThink OS Prompt 34** — a structured, block-based rendering layer for Vibe's chat responses.

## Status

- [x] Phase 1 — Foundation (schema + parser).
- [x] Phase 2 — Core renderers (`<BlockRenderer />`).
- [x] Phase 3 — Server-side opt-in `vibe-rich` envelope.
- [x] Phase 4 — Action protocol with confirmation gates.
- [x] Phase 5 — `vibe_rich_chat` feature flag.
- [x] Phase 6 — Streaming partial blocks + skeleton.
- [x] Phase 7 (G1) — Schema upgrade (metadata, presentationType, per-button risk).
- [x] Phase 7 (G2) — 15 additional block types (answer_evidence, kpi_cards, action_row, next_best_action, approval_card, record_preview, task_preview, email_preview, form, multi_source_view, timeline_snapshot, data_quality_panel, empty/error/loading states).
- [x] Phase 7 (G3) — Action protocol upgrade: risk levels, state machine, audit traces (`agent_action_traces`), approval queue (`pending_agent_actions`).
- [x] Phase 7 (G4) — Planner rules in system prompt, composition guardrails, admin demo route.

## Contract

`RichResponseSchema` in [`types.ts`](./types.ts) is the source of truth. Vibe wraps the JSON in a fenced block:

```
```vibe-rich
{ "v": 1, "summary": "...", "blocks": [ ... ] }
```
```

The client extracts, validates, applies guardrails, and renders. Invalid envelopes silently fall back to plain markdown.

## Block catalogue (27)

| Category | Blocks |
|---|---|
| Text | `text`, `heading`, `list`, `divider`, `callout` |
| Data | `key_value`, `stat`, `kpi_cards`, `chart`, `table` |
| Reasoning | `answer_evidence`, `multi_source_view`, `data_quality_panel`, `timeline_snapshot` |
| Entities | `creator_card`, `record_preview`, `task_preview` |
| Comms | `message_preview`, `email_preview` |
| Input | `form` |
| Actions | `actions`, `action_row`, `next_best_action`, `approval_card` |
| States | `empty_state`, `error_state`, `loading_state` |

## Action Protocol

| Risk | Behaviour |
|---|---|
| `low` | Runs immediately. |
| `medium` | Runs immediately, traced. |
| `high` | Always opens confirmation dialog. |
| `destructive` | Auto-routed to `pending_agent_actions` queue — never runs inline. |

Every invocation writes a row to `agent_action_traces` (intent, payload, outcome, duration, error). Set `disablePersistence: true` in tests / demo.

### Adding a new action intent

```ts
register("creator.archive", {
  label: "Archive creator",
  description: "Move this creator to your archive list.",
  riskLevel: "high",            // → confirmation gated
  enqueueForApproval: false,    // → set true to require external approval
  handler: async (payload, ctx) => { /* ... */ },
});
```

## Adding a new block type

1. Add the Zod schema to [`types.ts`](./types.ts) and append it to `BlockSchema` + `BLOCK_TYPES`.
2. Build the renderer in `blocks/` (or extend `extra-blocks.tsx`).
3. Wire it into [`BlockRenderer.tsx`](./BlockRenderer.tsx).
4. Add a demo entry to [`demo/demoScenarios.ts`](./demo/demoScenarios.ts).
5. Document the rule for it in the `RICH_OUTPUT_INSTRUCTIONS` block of `supabase/functions/_shared/prompts/vibe-chat.ts`.
6. Bump `VIBE_CHAT_PROMPT_VERSION` and redeploy `vibe-chat`.

## Composition Guardrails

[`planner/compositionRules.ts`](./planner/compositionRules.ts) is a defensive client-side filter:
- Drops empty `kpi_cards`.
- Drops `table` with <2 rows.
- Drops `chart` with <2 data points.
- Falls back to a text block if everything was dropped.

## Demo

Admin-only route: `/app/admin/agent-chat-demo` — gallery of every block + states.

## Cross-app reuse

The `src/components/ai-chat` folder is self-contained. To lift into another AutoThink app:
1. Copy the folder.
2. Apply the migration that creates `pending_agent_actions` + `agent_action_traces` (or strip the persistence in `useActionDispatcher`).
3. Add `RICH_OUTPUT_INSTRUCTIONS` to that app's agent system prompt.
4. Register host-specific action intents.
