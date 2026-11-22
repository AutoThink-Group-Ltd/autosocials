import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[INBOUND-REPLY] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const toField = formData.get('to') as string || '';
    const fromField = formData.get('from') as string || '';
    const subject = formData.get('subject') as string || '';
    const textBody = formData.get('text') as string || '';
    const htmlBody = formData.get('html') as string || '';
    const envelope = formData.get('envelope') as string || '';

    logStep('Received inbound email', { to: toField, from: fromField, subject });

    let messageId: string | null = null;
    const replyMatch = toField.match(/reply\+([a-f0-9-]+)@/i);
    if (replyMatch) {
      messageId = replyMatch[1];
    }

    if (!messageId) {
      try {
        const envelopeData = JSON.parse(envelope);
        const toAddresses = envelopeData.to || [];
        for (const addr of toAddresses) {
          const match = addr.match(/reply\+([a-f0-9-]+)@/i);
          if (match) {
            messageId = match[1];
            break;
          }
        }
      } catch {}
    }

    if (!messageId) {
      logStep('No message ID found in reply address', { to: toField });
      return new Response(JSON.stringify({ success: false, error: 'No matching message ID' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let fromEmail = fromField;
    let fromName: string | null = null;
    const nameEmailMatch = fromField.match(/^(.+?)\s*<(.+?)>$/);
    if (nameEmailMatch) {
      fromName = nameEmailMatch[1].replace(/"/g, '').trim();
      fromEmail = nameEmailMatch[2].trim();
    }

    const { data: originalEmail } = await adminClient
      .from('email_send_log')
      .select('workspace_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (!originalEmail) {
      logStep('Original email not found', { messageId });
      return new Response(JSON.stringify({ success: false, error: 'Original email not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: insertError } = await adminClient.from('email_replies').insert({
      workspace_id: originalEmail.workspace_id,
      original_message_id: messageId,
      from_email: fromEmail,
      from_name: fromName,
      subject,
      body_text: textBody || null,
      body_html: htmlBody || null,
    });

    if (insertError) {
      logStep('Failed to store reply', { error: insertError.message });
      return new Response(JSON.stringify({ success: false, error: insertError.message }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send reply notification emails
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    if (sendgridKey) {
      const { data: recipients } = await adminClient
        .from('notification_recipients')
        .select('email')
        .eq('workspace_id', originalEmail.workspace_id)
        .eq('bcc_on_replies', true);

      if (recipients?.length) {
        const previewText = textBody ? textBody.substring(0, 400).replace(/\n/g, '<br/>') : '(no text preview)';
        const truncated = textBody && textBody.length > 400;

        const notifHtml = `<!DOCTYPE html>
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
            <td style="background-color:#2563eb;color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">
              💬 Creator Reply
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:${BG_CARD};padding:20px 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
          <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">New Reply Received!</h2>
          <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
            <strong style="color:${TEXT_PRIMARY};">${fromName || fromEmail}</strong> replied to your outreach email.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:rgba(37,99,235,0.1);border-left:3px solid #2563eb;padding:12px 16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Subject</p>
              <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">${subject || '(no subject)'}</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:16px;border-radius:0 6px 6px 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px;">Reply Preview</p>
              <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;">${previewText}${truncated ? '<br/><em style="color:' + TEXT_MUTED + ';">…message truncated</em>' : ''}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
            📬 Log in to your dashboard to view the full reply and respond.
          </p>
        </td></tr>
        <tr><td style="background-color:${BG_CARD};padding:0 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};text-align:center;">
          <a href="${APP_URL}/app/messages" target="_blank" style="display:inline-block;background:linear-gradient(135deg,${BRAND_PINK},${BRAND_PURPLE});color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            View in Messages →
          </a>
        </td></tr>
        <tr><td style="background-color:${BG_CARD_INNER};padding:20px 40px;border-radius:0 0 12px 12px;border:1px solid ${BORDER_COLOR};border-top:none;text-align:center;">
          <p style="margin:0;font-size:11px;color:${TEXT_MUTED};line-height:1.5;">
            You're receiving this because you have reply notifications enabled in your
            <a href="${APP_URL}/app/settings" style="color:${BRAND_PINK};text-decoration:none;">workspace settings</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
                subject: `💬 Reply from ${fromName || fromEmail}`,
                content: [{ type: 'text/html', value: notifHtml }],
              }),
            });
          } catch {}
        }
        logStep('Reply notifications sent', { count: recipients.length });
      }
    }

    logStep('Reply stored successfully', { messageId, from: fromEmail });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
