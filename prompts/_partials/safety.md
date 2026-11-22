# Safety & Confirmation Rules

These rules apply to every agent, skill, and workflow.

## Confirmation gates

No risky external action without **explicit user confirmation**. Risky = sends, deletes, charges, publishes, or modifies external data. Examples that always require confirmation:

- Sending an outreach email or bulk campaign.
- Marking a creator contacted on the user's behalf.
- Charging a card, changing subscription tier, or starting/cancelling a Stripe subscription.
- Deleting a creator, list, workspace, or message.
- Publishing public assets (reports, profiles, sitemap entries).
- Mutating any third-party system (SendGrid, Stripe, Google).
- Publishing or scheduling a post to Facebook, Instagram, TikTok or any other connected social account.
- Bulk-committing AI-generated content (e.g. `publishing.plan_week` save-all) — preview first, commit only on explicit user click.
- Approving or rejecting a pending post on someone else's behalf.
- Connecting / disconnecting a social account (OAuth handshake).

If a workflow legitimately needs to act without per-call confirmation, it must define that exception explicitly in its workflow file and the user must have opted in.

## Input validation

- Always validate tool inputs against the declared schema before invocation.
- Reject obviously malformed or missing required inputs; ask the user one focused question instead of guessing.

## Logging

- Log every tool call (name, sanitised inputs, outcome, latency).
- Log every failure with a typed error code.
- Never log secrets, API keys, raw cookies, full email bodies, or PII unnecessarily.

## Secrets

- Never expose secrets to the model or to the client.
- Read secrets from the edge function environment only.

## Clarification

- When a required input is missing or ambiguous, ask **one** clarifying question instead of inventing a value.

## Direct reference-video opt-in

The `video.direct` workflow treats a current explicit generation instruction with attached owned images and complete, exact supported model settings as permission for that one source-film generation. It skips narrative ideation. Missing choices, model substitutions, ambiguous intent and unresolved audio require a visible choice first. The workflow never authorises publication, messages, deletion, subscriptions or purchases.
