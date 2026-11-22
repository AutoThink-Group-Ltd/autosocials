import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOGO_URL = "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-white.png";
const BRAND_PINK = "#E91E8C";
const BRAND_PURPLE = "#7c3aed";
const APP_URL = "https://autosocials.com";
const BG_DARK = "#0f0b1a";
const BG_CARD = "#1a1425";
const BG_CARD_INNER = "#241e30";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#c4b5d4";
const TEXT_MUTED = "#8b7fa3";
const BORDER_COLOR = "#2d2640";

function buildBrandedNotificationHtml(
  categoryLabel: string,
  categoryIcon: string,
  accentColor: string,
  bodyContent: string,
  ctaUrl: string = `${APP_URL}/app/messages`,
  ctaLabel: string = 'Open Dashboard →',
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_DARK};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,${BRAND_PINK},${BRAND_PURPLE});border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          <a href="${APP_URL}" target="_blank" style="text-decoration:none;">
            <img src="${LOGO_URL}" alt="AutoSocials" width="150" style="display:block;margin:0 auto;height:auto;" />
          </a>
        </td></tr>
        <tr><td style="background-color:${BG_CARD};padding:24px 40px 0;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:${accentColor};color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">
              ${categoryIcon} ${categoryLabel}
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:${BG_CARD};padding:20px 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
          ${bodyContent}
        </td></tr>
        <tr><td style="background-color:${BG_CARD};padding:0 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};text-align:center;">
          <a href="${ctaUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,${BRAND_PINK},${BRAND_PURPLE});color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            ${ctaLabel}
          </a>
        </td></tr>
        <tr><td style="background-color:${BG_CARD_INNER};padding:20px 40px;border-radius:0 0 12px 12px;border:1px solid ${BORDER_COLOR};border-top:none;text-align:center;">
          <p style="margin:0;font-size:11px;color:${TEXT_MUTED};line-height:1.5;">
            You're receiving this because you have notifications enabled in your
            <a href="${APP_URL}/app/settings" style="color:${BRAND_PINK};text-decoration:none;">workspace settings</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    if (!sendgridKey) {
      return new Response(JSON.stringify({ error: 'No SENDGRID_API_KEY configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { to_email, type, workspace_id, summary } = body;

    // Outreach summary notification (sent to workspace notification recipients)
    if (type === 'outreach_summary' && workspace_id && summary) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data: recipients } = await adminClient
        .from('notification_recipients')
        .select('email')
        .eq('workspace_id', workspace_id)
        .eq('bcc_on_campaigns', true);

      if (!recipients?.length) {
        return new Response(JSON.stringify({ success: true, message: 'No campaign notification recipients' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { total_creators, with_email, without_email, sent, failed, skipped } = summary;

      const statBoxStyle = (bg: string, border: string) =>
        `background-color:${bg};border:1px solid ${border};border-radius:8px;padding:16px;text-align:center;`;

      const html = buildBrandedNotificationHtml(
        'Outreach Complete',
        '🚀',
        BRAND_PINK,
        `
          <h2 style="margin:0 0 8px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">🎉 Outreach Campaign Complete!</h2>
          <p style="margin:0 0 20px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
            Your bulk creator outreach has finished. Here's a summary:
          </p>
          <table width="100%" cellpadding="0" cellspacing="8" style="margin:0 0 20px;">
            <tr>
              <td style="${statBoxStyle('rgba(5,150,105,0.1)', 'rgba(5,150,105,0.3)')}">
                <p style="margin:0;font-size:28px;font-weight:800;color:#10b981;">${sent}</p>
                <p style="margin:4px 0 0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Sent</p>
              </td>
              <td style="${statBoxStyle('rgba(220,38,38,0.1)', 'rgba(220,38,38,0.3)')}">
                <p style="margin:0;font-size:28px;font-weight:800;color:#ef4444;">${failed}</p>
                <p style="margin:4px 0 0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Failed</p>
              </td>
              <td style="${statBoxStyle('rgba(139,127,163,0.1)', 'rgba(139,127,163,0.3)')}">
                <p style="margin:0;font-size:28px;font-weight:800;color:${TEXT_MUTED};">${skipped}</p>
                <p style="margin:4px 0 0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Skipped</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BRAND_PURPLE};padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Campaign Details</p>
              <p style="margin:8px 0 0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.8;">
                👥 <strong style="color:${TEXT_PRIMARY};">${total_creators}</strong> creators selected<br/>
                📧 <strong style="color:${TEXT_PRIMARY};">${with_email}</strong> had email addresses<br/>
                🚫 <strong style="color:${TEXT_PRIMARY};">${without_email}</strong> missing emails
              </p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
            💡 Track opens, clicks, and replies in real-time from your dashboard.
          </p>
        `,
        `${APP_URL}/app/lists`,
        'View Outreach Results →',
      );

      for (const r of recipients) {
        try {
          await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sendgridKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: r.email }] }],
              from: { email: 'info@autosocials.com', name: 'AutoSocials' },
              subject: `🚀 Outreach Complete — ${sent} emails sent to creators`,
              content: [{ type: 'text/html', value: html }],
            }),
          });
        } catch {}
      }

      return new Response(JSON.stringify({ success: true, sent_to: recipients.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Individual test notifications
    if (!to_email || !type) {
      return new Response(JSON.stringify({ error: 'to_email and type (click|bounce|reply|outreach_summary) required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subjectLine = '';
    let html = '';

    if (type === 'click') {
      subjectLine = '🔗 Link clicked by reader@example.test';
      html = buildBrandedNotificationHtml(
        'Link Click', '🔗', '#059669',
        `
          <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">Link Clicked!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
            <strong style="color:${TEXT_PRIMARY};">reader@example.test</strong> clicked a link in your outreach email — this signals interest!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:rgba(5,150,105,0.1);border-left:3px solid #059669;padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Email Subject</p>
              <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">Quick question for you, Visualsofjulius</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Clicked Link</p>
              <p style="margin:4px 0 0;font-size:14px;"><a href="https://autosocials.com" style="color:${BRAND_PINK};text-decoration:none;">https://autosocials.com</a></p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
            💡 <strong style="color:${TEXT_SECONDARY};">Tip:</strong> This creator may be interested — consider sending a follow-up!
          </p>
        `,
      );
    } else if (type === 'bounce') {
      subjectLine = '⚠️ Email bounced — fakecreator@invalidmail.xyz';
      html = buildBrandedNotificationHtml(
        'Bounce Alert', '⚠️', '#dc2626',
        `
          <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">Email Bounced</h2>
          <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
            Your outreach email to <strong style="color:${TEXT_PRIMARY};">fakecreator@invalidmail.xyz</strong> has bounced and could not be delivered.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:rgba(220,38,38,0.1);border-left:3px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Original Subject</p>
              <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">Partnership opportunity with AutoSocials</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Bounce Reason</p>
              <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">550 5.1.1 The email account that you tried to reach does not exist.</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
            ✅ This contact has been <strong style="color:${TEXT_SECONDARY};">automatically blocked</strong> from future sends to protect your sender reputation.
          </p>
        `,
      );
    } else if (type === 'reply') {
      subjectLine = '💬 Reply from Visualsofjulius';
      html = buildBrandedNotificationHtml(
        'Creator Reply', '💬', '#2563eb',
        `
          <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">New Reply Received!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
            <strong style="color:${TEXT_PRIMARY};">Visualsofjulius</strong> replied to your outreach email.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:rgba(37,99,235,0.1);border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Subject</p>
              <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">Re: Quick question for you, Visualsofjulius</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">Reply Preview</p>
              <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;">Hey! Thanks for reaching out. I'd definitely be interested in learning more about affiliate partnerships. What kind of commission structure do you typically offer?<br/><br/>Let me know and we can set up a quick call.<br/><br/>Best,<br/>Julius</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
            📬 Log in to your dashboard to view the full reply and respond.
          </p>
        `,
      );
    } else {
      return new Response(JSON.stringify({ error: 'type must be click, bounce, reply, or outreach_summary' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to_email }] }],
        from: { email: 'info@autosocials.com', name: 'AutoSocials' },
        subject: subjectLine,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    const status = res.status;
    const responseText = await res.text();

    return new Response(JSON.stringify({
      success: status >= 200 && status < 300,
      status,
      type,
      to: to_email,
      details: responseText || 'OK',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
