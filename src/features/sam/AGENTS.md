# Sam

- Sam's respond tool sends canvas blocks as a JSON string (`blocks_json`) because Gemini strips untyped object items from array schemas.
- Sam's chat streams from `/api/sam/chat` (`src/lib/sam.chat.server.ts`, AI SDK on gateway Responses); tool confirmation policy lives in `src/lib/sam.tools.ts` and render/publish/send/delete only ever raise a `confirm` card, never execute from chat.

- Direct reference-video requests prepare a preview. The user approves the preview and exact supported model settings before production.
