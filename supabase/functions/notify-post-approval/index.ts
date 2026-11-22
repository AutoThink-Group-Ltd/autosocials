import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const FROM_EMAIL = "info@autosocials.com";
const FROM_NAME = "AutoSocials";
const APP_URL = "https://autosocialsapp.lovable.app";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { post_id, action } = await req.json();
    if (!post_id || !["submitted", "approved", "rejected"].includes(action)) {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: post } = await admin
      .from("posts")
      .select("id, workspace_id, caption, submitted_by, approved_by, rejection_reason")
      .eq("id", post_id)
      .maybeSingle();
    if (!post) throw new Error("Post not found");

    const { data: workspace } = await admin
      .from("workspaces").select("name").eq("id", post.workspace_id).maybeSingle();

    let recipients: { email: string; name: string }[] = [];
    let subject = "";
    let body = "";
    const link = `${APP_URL}/app/publishing/approvals`;
    const editorLink = `${APP_URL}/app/publishing/composer?id=${post.id}`;
    const preview = (post.caption ?? "").slice(0, 140) || "(no caption yet)";

    if (action === "submitted") {
      // Email all workspace owners
      const { data: owners } = await admin.rpc("get_workspace_members_with_email", { _workspace_id: post.workspace_id });
      recipients = (owners ?? []).filter((o: any) => o.role === "owner").map((o: any) => ({
        email: o.email, name: o.full_name ?? o.email,
      }));
      subject = `New post awaiting your approval — ${workspace?.name ?? ""}`;
      body = `<p>A new social post is waiting for review.</p>
<p style="color:#555;font-style:italic;">"${escapeHtml(preview)}"</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0F172A;color:#fff;border-radius:8px;text-decoration:none;">Review approvals</a></p>`;
    } else {
      // Email the submitter
      if (!post.submitted_by) return new Response(JSON.stringify({ ok: true, skipped: "no submitter" }), { headers: corsHeaders });
      const { data: u } = await admin.from("profiles").select("full_name").eq("id", post.submitted_by).maybeSingle();
      const { data: { user } } = await admin.auth.admin.getUserById(post.submitted_by);
      if (!user?.email) return new Response(JSON.stringify({ ok: true, skipped: "no email" }), { headers: corsHeaders });
      recipients = [{ email: user.email, name: u?.full_name ?? user.email }];
      if (action === "approved") {
        subject = `Your post was approved`;
        body = `<p>Good news — your post has been approved and is now scheduled to publish.</p>
<p style="color:#555;font-style:italic;">"${escapeHtml(preview)}"</p>
<p><a href="${editorLink}" style="display:inline-block;padding:10px 18px;background:#0F172A;color:#fff;border-radius:8px;text-decoration:none;">View post</a></p>`;
      } else {
        subject = `Your post was sent back for changes`;
        body = `<p>Your reviewer asked for changes before publishing.</p>
${post.rejection_reason ? `<p><strong>Note:</strong> ${escapeHtml(post.rejection_reason)}</p>` : ""}
<p style="color:#555;font-style:italic;">"${escapeHtml(preview)}"</p>
<p><a href="${editorLink}" style="display:inline-block;padding:10px 18px;background:#0F172A;color:#fff;border-radius:8px;text-decoration:none;">Edit post</a></p>`;
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = wrap(body);
    await Promise.all(recipients.map((r) => sendgrid(r, subject, html)));

    return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-post-approval error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function wrap(inner: string) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f7f9;padding:32px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<h2 style="margin:0 0 16px 0;font-size:18px;color:#0F172A;">AutoSocials</h2>
<div style="font-size:14px;line-height:1.6;color:#333;">${inner}</div>
<p style="margin-top:32px;font-size:12px;color:#999;">Sent by Vibe</p>
</div></body></html>`;
}

async function sendgrid(to: { email: string; name: string }, subject: string, html: string) {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [to] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!r.ok) console.error("SendGrid error", r.status, await r.text());
}