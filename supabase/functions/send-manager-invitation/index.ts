import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[SEND-MANAGER-INVITATION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      agency_user_id,
      email,
      contact_name,
      client_company_name,
      workspace_id,
      token,
      invitation_id,
    } = await req.json();

    if (!email || !agency_user_id) throw new Error("email and agency_user_id required");

    log("Processing invitation", { email, agency_user_id });

    // Fetch agency profile
    const { data: agencyProfile } = await supabase
      .from("agency_profiles")
      .select("agency_name, booking_url, contact_email, agency_logo_url")
      .eq("user_id", agency_user_id)
      .single();

    const agencyName = agencyProfile?.agency_name || "Your Agency Partner";
    const bookingUrl = agencyProfile?.booking_url;
    const replyToEmail = agencyProfile?.contact_email || "info@autosocials.com";
    const agencyLogoUrl = agencyProfile?.agency_logo_url;

    // Generate AI personalized intro via OpenAI
    let aiIntro = `We're excited to invite ${client_company_name || "your company"} to AutoSocials, a powerful platform for creator discovery and outreach. ${agencyName} has set up your account to help you find and collaborate with the perfect creators for your brand.`;

    try {
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (OPENAI_API_KEY) {
        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "system",
                content:
                  "You write short, professional, warm email intros for agency-to-client invitations. Write exactly 2 sentences. Do NOT include any greeting like 'Hi' or 'Dear'. Do NOT include a sign-off. Be specific about the value of influencer marketing and creator discovery. Mention the agency name naturally.",
              },
              {
                role: "user",
                content: `Write a 2-sentence email intro inviting "${client_company_name || "the client"}" to join AutoSocials. The invitation is from "${agencyName}". The platform helps brands discover and collaborate with social media creators.`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const generatedText = aiData.choices?.[0]?.message?.content?.trim();
          if (generatedText) {
            // Strip any leading greeting
            aiIntro = generatedText.replace(/^(Hi|Hello|Dear|Hey)\s+[^,.\n]*[,.]?\s*/i, "");
          }
        }
      }
    } catch (aiErr) {
      log("AI generation failed, using fallback", { error: String(aiErr) });
    }

    // Build invite URL
    const origin = Deno.env.get("SITE_ORIGIN") || "https://autosocials.com";
    const inviteUrl = `${origin}/accept-invite?token=${token}`;

    // Extract first name only
    const firstName = contact_name ? contact_name.trim().split(/\s+/)[0] : "";

    // AutoSocials logo from storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/logo-white.png`;

    // Build branded HTML email — dark theme
    const bookingBanner = bookingUrl
      ? `<tr><td style="padding:24px 40px;background:#1a1a2e;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
           <p style="margin:0 0 10px;font-size:13px;color:rgba(255,255,255,0.5)">Have questions? Book a call with ${agencyName}</p>
           <a href="${bookingUrl}" style="display:inline-block;padding:10px 24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px">Book a Call →</a>
         </td></tr>`
      : "";

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're Invited to AutoSocials</title></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#13132b;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)">
  <!-- Logo Header -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <img src="${logoUrl}" alt="AutoSocials" style="height:40px;width:auto;margin-bottom:24px" />
  </td></tr>
  <!-- Hero Banner -->
  <tr><td style="padding:0 40px;text-align:center">
    <div style="background:linear-gradient(135deg,rgba(228,53,139,0.12),rgba(147,51,234,0.12));border:1px solid rgba(228,53,139,0.2);border-radius:12px;padding:32px 24px;margin-bottom:8px">
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff">You're Invited! 🎉</h1>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5)">${agencyName} has invited you to AutoSocials</p>
    </div>
  </td></tr>
  <!-- Body Content -->
  <tr><td style="padding:28px 40px 32px">
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.85);line-height:1.6">Hi${firstName ? ` ${firstName}` : ""},</p>
    <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.7">${aiIntro}</p>
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 28px">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${inviteUrl}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="16%" fillcolor="#e4358b">
        <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Accept Invitation →</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${inviteUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#e4358b,#9333ea);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(228,53,139,0.35)">Accept Invitation →</a>
      <!--<![endif]-->
    </td></tr></table>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;word-break:break-all">Or copy this link: <a href="${inviteUrl}" style="color:#e4358b;text-decoration:none">${inviteUrl}</a></p>
  </td></tr>
  ${bookingBanner}
  <!-- Footer -->
  <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25)">Sent via <a href="https://autosocials.com" style="color:#e4358b;text-decoration:none;font-weight:600">AutoSocials</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

    // Determine from_email — never use info@ if it appears in any recipient
    const recipientEmails = [email, replyToEmail].map((e) => e.toLowerCase());
    const fromEmail = recipientEmails.some((e) => e === "info@autosocials.com")
      ? "info@autosocials.com"
      : "info@autosocials.com";

    // Send via SendGrid
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
    if (!sendgridKey) throw new Error("SENDGRID_API_KEY not set");

    const sgPayload = {
      personalizations: [
        {
          to: [{ email }],
          ...(replyToEmail && replyToEmail !== email.toLowerCase()
            ? { bcc: [{ email: replyToEmail }] }
            : {}),
        },
      ],
      from: { email: fromEmail, name: agencyName },
      reply_to: { email: replyToEmail },
      subject: `${agencyName} — You've Been Invited to AutoSocials`,
      content: [{ type: "text/html", value: html }],
      categories: ["agency-invitation"],
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
      log("SendGrid error", { status: sgResponse.status, body: errorBody });
      throw new Error(`SendGrid error: ${sgResponse.status}`);
    }

    log("Invitation email sent", { email });

    // Update sent_at on invitation
    if (invitation_id) {
      await supabase
        .from("agency_client_invitations")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", invitation_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
