// Registered tool descriptor for `outreach.send_email`.
// The actual SendGrid I/O lives in `supabase/functions/send-email/index.ts`
// (kept there because it has long-standing warmup, blocked-contact, and
// SendGrid-subuser logic). This descriptor exists so the tool is
// discoverable by the registry and so its safety contract is explicit.

import { registerTool } from "../registry.ts";
import type { RegisteredTool } from "../types.ts";

interface SendEmailInput {
  workspace_id: string;
  to_email: string;
  to_name?: string | null;
  subject: string;
  body_html: string;
  sender_identity_id?: string | null;
  bcc?: string[];
  confirmed: boolean;
}

export const outreachSendEmailTool: RegisteredTool<SendEmailInput, { message_id: string }> = {
  name: "outreach.send_email",
  description:
    "Send a single outreach email via the workspace's verified SendGrid sender. Risky: external dispatch.",
  permissions: ["external", "write"],
  requiresConfirmation: "user_confirmation",
  parseInput: (raw) => {
    const r = raw as Partial<SendEmailInput>;
    if (!r?.workspace_id || !r?.to_email || !r?.subject || !r?.body_html) {
      throw new Error("workspace_id, to_email, subject, body_html are required");
    }
    return {
      workspace_id: r.workspace_id,
      to_email: r.to_email,
      to_name: r.to_name ?? null,
      subject: r.subject,
      body_html: r.body_html,
      sender_identity_id: r.sender_identity_id ?? null,
      bcc: r.bcc,
      confirmed: r.confirmed === true,
    };
  },
  handler: async () => {
    // Implementation lives in the `send-email` edge function; this descriptor
    // is referenced by the registry for discoverability + policy enforcement.
    return {
      ok: false,
      error: {
        code: "not_dispatched_here",
        message:
          "Invoke the `send-email` edge function directly; this descriptor only declares policy.",
      },
    };
  },
};

registerTool(outreachSendEmailTool);