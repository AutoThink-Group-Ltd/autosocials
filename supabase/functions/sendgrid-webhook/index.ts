import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[SENDGRID-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const BOUNCE_RATE_THRESHOLD = 0.05; // 5%

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
        <!-- Logo Header -->
        <tr><td style="background:linear-gradient(135deg,${BRAND_PINK},${BRAND_PURPLE});border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          <a href="${APP_URL}" target="_blank" style="text-decoration:none;">
            <img src="${LOGO_URL}" alt="AutoSocials" width="150" style="display:block;margin:0 auto;height:auto;" />
          </a>
        </td></tr>
        <!-- Category Badge -->
        <tr><td style="background-color:${BG_CARD};padding:24px 40px 0;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:${accentColor};color:#ffffff;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;">
              ${categoryIcon} ${categoryLabel}
            </td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:${BG_CARD};padding:20px 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
          ${bodyContent}
        </td></tr>
        <!-- CTA -->
        <tr><td style="background-color:${BG_CARD};padding:0 40px 32px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};text-align:center;">
          <a href="${ctaUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,${BRAND_PINK},${BRAND_PURPLE});color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
            ${ctaLabel}
          </a>
        </td></tr>
        <!-- Footer -->
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

// ─── Notification email helper ──────────────────────────────────
async function sendNotificationEmails(
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string,
  columnKey: 'bcc_on_clicks' | 'bcc_on_bounces' | 'bcc_on_replies',
  subjectLine: string,
  categoryLabel: string,
  categoryIcon: string,
  accentColor: string,
  bodyContent: string,
) {
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
  if (!sendgridKey) {
    logStep('No SENDGRID_API_KEY, skipping notification emails');
    return;
  }

  const { data: recipients } = await adminClient
    .from('notification_recipients')
    .select('email, name')
    .eq('workspace_id', workspaceId)
    .eq(columnKey, true);

  if (!recipients?.length) return;

  // Also check agency notification prefs
  const { data: agencyLink } = await adminClient
    .from('agency_client_links')
    .select('agency_user_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle();

  let agencyEmails: string[] = [];
  if (agencyLink) {
    const { data: agencyPrefs } = await adminClient
      .from('agency_notification_preferences')
      .select('bcc_emails')
      .eq('agency_user_id', agencyLink.agency_user_id)
      .eq('client_workspace_id', workspaceId)
      .eq(columnKey, true)
      .maybeSingle();
    if (agencyPrefs?.bcc_emails) agencyEmails = agencyPrefs.bcc_emails;
  }

  const allEmails = [
    ...recipients.map(r => r.email.toLowerCase()),
    ...agencyEmails.map(e => e.toLowerCase()),
  ];
  const uniqueEmails = [...new Set(allEmails)];

  if (uniqueEmails.length === 0) return;

  const fullHtml = buildBrandedNotificationHtml(categoryLabel, categoryIcon, accentColor, bodyContent);

  for (const email of uniqueEmails) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: 'info@autosocials.com', name: 'AutoSocials' },
          subject: subjectLine,
          content: [{ type: 'text/html', value: fullHtml }],
        }),
      });
      logStep('Notification sent', { to: email, type: columnKey, status: res.status });
    } catch (err) {
      logStep('Notification send failed', { to: email, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const events = await req.json();

    if (!Array.isArray(events)) {
      logStep('Invalid payload — not an array');
      return new Response('OK', { status: 200 });
    }

    logStep('Processing events', { count: events.length });

    const metricsUpdates = new Map<string, {
      workspace_id: string;
      metric_date: string;
      emails_sent: number;
      bounces: number;
      spam_reports: number;
      opens: number;
      clicks: number;
    }>();

    const getMetricsKey = (wsId: string, date: string) => `${wsId}:${date}`;

    const ensureMetrics = (wsId: string, date: string) => {
      const key = getMetricsKey(wsId, date);
      if (!metricsUpdates.has(key)) {
        metricsUpdates.set(key, {
          workspace_id: wsId,
          metric_date: date,
          emails_sent: 0,
          bounces: 0,
          spam_reports: 0,
          opens: 0,
          clicks: 0,
        });
      }
      return metricsUpdates.get(key)!;
    };

    const bouncedWorkspaces = new Set<string>();

    for (const event of events) {
      const eventType = event.event;
      const workspaceId = event.workspace_id;
      const messageId = event.message_uuid;
      const timestamp = event.timestamp
        ? new Date(event.timestamp * 1000).toISOString()
        : new Date().toISOString();
      const eventDate = timestamp.substring(0, 10);

      if (!workspaceId) {
        logStep('Skipping event — no workspace_id', { event: eventType, sg_message_id: event.sg_message_id });
        continue;
      }

      if (event.platform && event.platform !== 'autosocials') {
        continue;
      }

      switch (eventType) {
        case 'delivered': {
          const m = ensureMetrics(workspaceId, eventDate);
          m.emails_sent++;

          if (messageId) {
            await adminClient
              .from('email_send_log')
              .update({ status: 'delivered' })
              .eq('message_id', messageId)
              .eq('workspace_id', workspaceId);
          }
          break;
        }

        case 'bounce':
        case 'dropped': {
          const m = ensureMetrics(workspaceId, eventDate);
          m.bounces++;
          bouncedWorkspaces.add(workspaceId);

          const recipientEmail = event.email;
          if (recipientEmail) {
            await adminClient
              .from('blocked_contacts')
              .upsert(
                {
                  workspace_id: workspaceId,
                  email: recipientEmail.toLowerCase(),
                  reason: eventType === 'bounce' ? 'bounce' : 'dropped',
                  details: event.reason || event.response || null,
                  blocked_at: timestamp,
                },
                { onConflict: 'workspace_id,email', ignoreDuplicates: false }
              );
            logStep('Blocked contact', { email: recipientEmail, reason: eventType, workspace: workspaceId });
          }

          if (messageId) {
            await adminClient
              .from('email_send_log')
              .update({ status: 'bounced' })
              .eq('message_id', messageId)
              .eq('workspace_id', workspaceId);
          }

          if (recipientEmail) {
            let bounceSubject = '';
            if (messageId) {
              const { data: origEmail } = await adminClient
                .from('email_send_log')
                .select('subject')
                .eq('message_id', messageId)
                .maybeSingle();
              bounceSubject = origEmail?.subject || '';
            }
            const bounceReason = event.reason || event.response || 'No details provided';

            await sendNotificationEmails(
              adminClient,
              workspaceId,
              'bcc_on_bounces',
              `⚠️ Email bounced — ${recipientEmail}`,
              'Bounce Alert',
              '⚠️',
              '#dc2626',
              `
                <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">Email Bounced</h2>
                <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
                  Your outreach email to <strong style="color:${TEXT_PRIMARY};">${recipientEmail}</strong> has bounced and could not be delivered.
                </p>
                ${bounceSubject ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                  <tr><td style="background-color:rgba(220,38,38,0.1);border-left:3px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;">
                    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Original Subject</p>
                    <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">${bounceSubject}</p>
                  </td></tr>
                </table>` : ''}
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                  <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:12px 16px;border-radius:0 6px 6px 0;">
                    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Bounce Reason</p>
                    <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">${bounceReason}</p>
                  </td></tr>
                </table>
                <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
                  ✅ This contact has been <strong style="color:${TEXT_SECONDARY};">automatically blocked</strong> from future sends to protect your sender reputation.
                </p>
              `,
            );
          }
          break;
        }

        case 'spamreport': {
          const m = ensureMetrics(workspaceId, eventDate);
          m.spam_reports++;
          bouncedWorkspaces.add(workspaceId);

          const spamEmail = event.email;
          if (spamEmail) {
            await adminClient
              .from('blocked_contacts')
              .upsert(
                {
                  workspace_id: workspaceId,
                  email: spamEmail.toLowerCase(),
                  reason: 'spam_report',
                  details: 'Recipient marked email as spam',
                  blocked_at: timestamp,
                },
                { onConflict: 'workspace_id,email', ignoreDuplicates: false }
              );
            logStep('Spam report blocked', { email: spamEmail, workspace: workspaceId });
          }
          break;
        }

        case 'open': {
          const m = ensureMetrics(workspaceId, eventDate);
          m.opens++;
          break;
        }

        case 'click': {
          const m = ensureMetrics(workspaceId, eventDate);
          m.clicks++;

          const clickEmail = event.email || 'Unknown';
          const clickUrl = event.url || '';
          let clickSubject = '';
          if (messageId) {
            const { data: origEmail } = await adminClient
              .from('email_send_log')
              .select('subject, to_name')
              .eq('message_id', messageId)
              .maybeSingle();
            clickSubject = origEmail?.subject || '';
          }

          await sendNotificationEmails(
            adminClient,
            workspaceId,
            'bcc_on_clicks',
            `🔗 Link clicked by ${clickEmail}`,
            'Link Click',
            '🔗',
            '#059669',
            `
              <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT_PRIMARY};font-weight:700;">Link Clicked!</h2>
              <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.6;">
                <strong style="color:${TEXT_PRIMARY};">${clickEmail}</strong> clicked a link in your outreach email — this signals interest!
              </p>
              ${clickSubject ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr><td style="background-color:rgba(5,150,105,0.1);border-left:3px solid #059669;padding:12px 16px;border-radius:0 6px 6px 0;">
                  <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Email Subject</p>
                  <p style="margin:4px 0 0;font-size:14px;color:${TEXT_SECONDARY};">${clickSubject}</p>
                </td></tr>
              </table>` : ''}
              ${clickUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr><td style="background-color:${BG_CARD_INNER};border-left:3px solid ${BORDER_COLOR};padding:12px 16px;border-radius:0 6px 6px 0;">
                  <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Clicked Link</p>
                  <p style="margin:4px 0 0;font-size:14px;"><a href="${clickUrl}" style="color:${BRAND_PINK};text-decoration:none;word-break:break-all;">${clickUrl.length > 60 ? clickUrl.substring(0, 60) + '…' : clickUrl}</a></p>
                </td></tr>
              </table>` : ''}
              <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
                💡 <strong style="color:${TEXT_SECONDARY};">Tip:</strong> This creator may be interested — consider sending a follow-up!
              </p>
            `,
          );
          break;
        }

        case 'unsubscribe': {
          const unsubEmail = event.email;
          if (unsubEmail) {
            await adminClient
              .from('blocked_contacts')
              .upsert(
                {
                  workspace_id: workspaceId,
                  email: unsubEmail.toLowerCase(),
                  reason: 'unsubscribe',
                  details: 'Recipient unsubscribed',
                  blocked_at: timestamp,
                },
                { onConflict: 'workspace_id,email', ignoreDuplicates: false }
              );
          }
          break;
        }

        default:
          break;
      }
    }

    // Batch upsert metrics
    for (const metrics of metricsUpdates.values()) {
      const { data: existing } = await adminClient
        .from('workspace_sending_metrics')
        .select('id, emails_sent, bounces, spam_reports, opens, clicks')
        .eq('workspace_id', metrics.workspace_id)
        .eq('metric_date', metrics.metric_date)
        .maybeSingle();

      if (existing) {
        await adminClient
          .from('workspace_sending_metrics')
          .update({
            emails_sent: existing.emails_sent + metrics.emails_sent,
            bounces: existing.bounces + metrics.bounces,
            spam_reports: existing.spam_reports + metrics.spam_reports,
            opens: existing.opens + metrics.opens,
            clicks: existing.clicks + metrics.clicks,
          })
          .eq('id', existing.id);
      } else {
        await adminClient
          .from('workspace_sending_metrics')
          .insert(metrics);
      }
    }

    // Auto-pause check for workspaces that had bounces
    for (const wsId of bouncedWorkspaces) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
      const today = new Date().toISOString().substring(0, 10);

      const { data: recentMetrics } = await adminClient
        .from('workspace_sending_metrics')
        .select('emails_sent, bounces, spam_reports')
        .eq('workspace_id', wsId)
        .gte('metric_date', yesterday)
        .lte('metric_date', today);

      if (recentMetrics && recentMetrics.length > 0) {
        const totalSent = recentMetrics.reduce((s, m) => s + (m.emails_sent || 0), 0);
        const totalBounces = recentMetrics.reduce((s, m) => s + (m.bounces || 0) + (m.spam_reports || 0), 0);

        if (totalSent > 0) {
          const bounceRate = totalBounces / totalSent;
          if (bounceRate > BOUNCE_RATE_THRESHOLD) {
            logStep('AUTO-PAUSE triggered', { workspace: wsId, bounceRate: (bounceRate * 100).toFixed(1) + '%', sent: totalSent, bounces: totalBounces });
            await adminClient
              .from('workspace_sendgrid_config')
              .update({
                sending_paused: true,
                pause_reason: `Auto-paused: ${(bounceRate * 100).toFixed(1)}% bounce rate (${totalBounces}/${totalSent} in last 24h). Review blocked contacts and fix your list quality before resuming.`,
                updated_at: new Date().toISOString(),
              })
              .eq('workspace_id', wsId);
          }
        }
      }
    }

    logStep('Events processed', { total: events.length, metricsKeys: metricsUpdates.size, bouncedWs: bouncedWorkspaces.size });

    return new Response('OK', { status: 200 });
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response('OK', { status: 200 });
  }
});
