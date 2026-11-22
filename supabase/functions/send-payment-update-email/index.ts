import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[SEND-PAYMENT-UPDATE-EMAIL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const LOGO_URL = "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-white.png";

function buildEmailHtml(firstName: string, portalUrl: string, companyName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,hsl(330,80%,52%),hsl(280,60%,55%));border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="AutoSocials" width="160" style="display:block;margin:0 auto;" />
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#f9fafb;padding:40px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#1a1a2e;">Payment Update Needed</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hi ${firstName},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">We noticed that the latest payment for <strong>${companyName}</strong> didn't go through. These things happen — and it's a quick fix.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Momentum is building on the account, and updating your payment method now will ensure:</p>
          <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.8;color:#374151;">
            <li>Smooth continuation of campaigns and services</li>
            <li>Uninterrupted analytics tracking and insights</li>
            <li>No gaps in your creator data or outreach history</li>
          </ul>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">No login required — the link below takes you directly to a secure payment portal.</p>
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,hsl(330,80%,52%),hsl(280,60%,55%));color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Update Payment Method →</a>
          </td></tr></table>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#9ca3af;">If you've already updated your payment details, please disregard this email.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#9ca3af;">Thank you,<br/><strong>The AutoSocials Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    if (!sendgridKey) throw new Error("SENDGRID_API_KEY not set");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");

    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const { workspace_id, recipients, recipient_names = {} } = body;

    if (!recipients?.length) throw new Error("No recipients provided");

    // Get workspace info
    let workspaceId = workspace_id;
    if (!workspaceId) {
      const { data: profile } = await supabaseAdmin.from("profiles").select("primary_workspace_id, workspace_id").eq("id", userId).single();
      workspaceId = profile?.primary_workspace_id || profile?.workspace_id;
    }

    const { data: workspace } = await supabaseAdmin.from("workspaces").select("name, contact_name").eq("id", workspaceId).single();
    const companyName = workspace?.name || "your account";

    // Get Stripe customer ID for the workspace
    const { data: subRecord } = await supabaseAdmin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspaceId).single();
    if (!subRecord?.stripe_customer_id) throw new Error("No billing record found for this workspace");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://autosocialsapp.lovable.app";

    // Create a billing portal session with payment_method_update flow
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subRecord.stripe_customer_id,
      return_url: `${origin}/app/settings`,
      flow_data: { type: "payment_method_update" as any },
    });

    logStep("Portal session created", { url: portalSession.url });

    // Get sender user email for BCC
    const { data: senderUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const bccEmail = senderUser?.user?.email || "info@autosocials.com";

    // Send email to each recipient
    for (const recipientEmail of recipients) {
      const name = recipient_names[recipientEmail] || recipientEmail.split("@")[0];
      const firstName = name.split(" ")[0];
      const html = buildEmailHtml(firstName, portalSession.url, companyName);

      const sgPayload = {
        personalizations: [{
          to: [{ email: recipientEmail }],
          bcc: [{ email: bccEmail }, { email: "info@autosocials.com" }],
        }],
        from: { email: "info@autosocials.com", name: "AutoSocials" },
        subject: `Please update payment details for ${companyName} to keep campaigns running smoothly`,
        content: [{ type: "text/html", value: html }],
        ip_pool_name: "autosocials_pool",
      };

      const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sgPayload),
      });

      if (!sgResponse.ok) {
        const errorBody = await sgResponse.text();
        logStep("SendGrid error", { status: sgResponse.status, body: errorBody, recipient: recipientEmail });
        // Continue sending to other recipients
      } else {
        logStep("Email sent", { to: recipientEmail });
      }
    }

    return new Response(JSON.stringify({ success: true, sent: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
