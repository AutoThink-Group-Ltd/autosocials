import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';
import {
  appendEvent,
  createRun,
  finalizeRun,
  makeSeqCounter,
} from '../_shared/agent/trace.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[SEND-EMAIL] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const stripLegacyHtmlSignoff = (html: string) => {
  return html
    .replace(
      /(?:<p[^>]*>\s*(?:best|cheers|kind regards|regards|sincerely)\s*,?\s*<\/p>\s*)<p[^>]*>\s*(?:\[your name\]|\{name\})\s*<\/p>\s*$/i,
      '',
    )
    .replace(
      /(?:<br\s*\/?>(?:\s|&nbsp;)*){1,3}(?:best|cheers|kind regards|regards|sincerely)\s*,?(?:<br\s*\/?>(?:\s|&nbsp;)*)+(?:\[your name\]|\{name\})\s*$/i,
      '',
    )
    .trim();
};

const normalizeLastParagraphSpacing = (html: string) => {
  const withPlainLastParagraphStyled = html.replace(
    /<p>([\s\S]*?)<\/p>\s*$/i,
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#333;">$1</p>',
  );

  return withPlainLastParagraphStyled.replace(
    /<p([^>]*)style="([^"]*)"([^>]*)>([\s\S]*?)<\/p>\s*$/i,
    (_match, beforeStyle, styleValue, afterStyle, content) => {
      const cleanedStyle = styleValue
        .replace(/margin\s*:[^;]*;?/gi, '')
        .trim();
      const mergedStyle = `${cleanedStyle ? `${cleanedStyle};` : ''}margin:0;`;
      return `<p${beforeStyle}style="${mergedStyle}"${afterStyle}>${content}</p>`;
    },
  );
};

const stripLeadingSignatureSpace = (html: string) => {
  return html
    .replace(/^(?:\s|<br\s*\/?\s*>|<p[^>]*>\s*(?:&nbsp;)?\s*<\/p>)+/i, '')
    .trim();
};

// Warmup daily limits per stage
const WARMUP_LIMITS: Record<string, number> = {
  new: 1000,
  onboarding: 1000,
  warming: 2000,
  warm: 5000,
  graduated: Infinity,
};

// Workspaces with no daily send limits
const UNLIMITED_WORKSPACE_IDS = new Set<string>();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendgridParentKey = Deno.env.get('SENDGRID_API_KEY');

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { workspace_id, to_email, to_name, subject, body_html, sender_identity_id, confirmed } = body;

    if (!workspace_id || !to_email || !subject || !body_html) {
      return new Response(JSON.stringify({ error: 'workspace_id, to_email, subject, and body_html are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Agentic safety gate: outreach.send_email is a risky external action.
    // Requires explicit user confirmation (the UI "Send" CTA must pass confirmed:true).
    if (confirmed !== true) {
      return new Response(JSON.stringify({
        error: 'confirmation_required',
        message: 'outreach.send_email requires explicit user confirmation. Re-invoke with confirmed:true after the user approves.',
      }), {
        status: 412, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Open an agent_run for trace visibility (best-effort; never blocks send).
    let runId: string | null = null;
    const seq = makeSeqCounter();
    try {
      runId = await createRun({
        workspaceId: workspace_id,
        userId,
        agentId: 'vibe',
        workflowId: 'outreach.send_email',
        request: { to_email, subject, sender_identity_id },
        initialState: 'running',
      });
      await appendEvent({
        runId,
        workspaceId: workspace_id,
        seq: seq(),
        kind: 'confirmation_granted',
        name: 'outreach.send_email',
      });
    } catch (e) {
      console.warn('[SEND-EMAIL] trace open failed (non-fatal):', e);
    }

    // Verify workspace membership
    const { data: isMember } = await adminClient.rpc('is_workspace_member', {
      _user_id: userId,
      _workspace_id: workspace_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get workspace SendGrid config (including pause flag and warmup stage)
    const { data: sgConfig } = await adminClient
      .from('workspace_sendgrid_config')
      .select('api_key, subuser_username, sending_paused, pause_reason, warmup_stage, total_sends_lifetime')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (!sgConfig?.api_key) {
      return new Response(JSON.stringify({ error: 'Email not configured. Set up email in Settings first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CHECK 1: Sending paused?
    if (sgConfig.sending_paused) {
      return new Response(JSON.stringify({
        error: `Sending is paused for this workspace. Reason: ${sgConfig.pause_reason || 'High bounce rate detected. Review your blocked contacts before resuming.'}`,
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CHECK 2: Blocked contact?
    const { data: blocked } = await adminClient
      .from('blocked_contacts')
      .select('id, reason')
      .eq('workspace_id', workspace_id)
      .ilike('email', to_email.toLowerCase())
      .maybeSingle();

    if (blocked) {
      logStep('Blocked recipient', { to_email, reason: blocked.reason });
      return new Response(JSON.stringify({
        error: `Cannot send to ${to_email} — this address is blocked (${blocked.reason}). Remove from your list.`,
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CHECK 3: Warmup daily limit (skip for unlimited workspaces)
    const warmupStage = sgConfig.warmup_stage || 'onboarding';
    const dailyLimit = WARMUP_LIMITS[warmupStage] ?? 1000;

    if (dailyLimit !== Infinity && !UNLIMITED_WORKSPACE_IDS.has(workspace_id)) {
      const today = new Date().toISOString().substring(0, 10);
      const { data: todayMetrics } = await adminClient
        .from('workspace_sending_metrics')
        .select('emails_sent')
        .eq('workspace_id', workspace_id)
        .eq('metric_date', today)
        .maybeSingle();

      const sentToday = todayMetrics?.emails_sent || 0;
      if (sentToday >= dailyLimit) {
        logStep('Warmup limit reached', { stage: warmupStage, limit: dailyLimit, sent: sentToday });
        return new Response(JSON.stringify({
          error: `Daily send limit reached (${dailyLimit} emails for "${warmupStage}" warmup stage). ${sentToday} already sent today. Limit increases as your IP warms up.`,
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get sender identity
    let senderEmail = 'info@autosocials.com';
    let senderName = 'AutoSocials';
    let resolvedIdentityId = sender_identity_id || null;

    if (sender_identity_id) {
      const { data: identity } = await adminClient
        .from('sender_identities')
        .select('*')
        .eq('id', sender_identity_id)
        .maybeSingle();
      if (identity) {
        senderEmail = identity.sender_email;
        senderName = identity.sender_name;
      }
    } else {
      // Use default sender identity
      const { data: defaultIdentity } = await adminClient
        .from('sender_identities')
        .select('*')
        .eq('workspace_id', workspace_id)
        .eq('is_default', true)
        .maybeSingle();
      if (defaultIdentity) {
        senderEmail = defaultIdentity.sender_email;
        senderName = defaultIdentity.sender_name;
        resolvedIdentityId = defaultIdentity.id;
      }
    }

    // CHECK 4: Sender verification auto-sync
    const senderDomain = senderEmail.toLowerCase().split('@')[1];
    const { data: domainRecord } = await adminClient
      .from('workspace_domains')
      .select('domain, status')
      .eq('workspace_id', workspace_id)
      .ilike('domain', senderDomain)
      .maybeSingle();

    const isDomainVerifiedForSender = domainRecord?.status === 'verified';

    if (sendgridParentKey && sgConfig.subuser_username) {
      try {
        const verifiedRes = await fetch('https://api.sendgrid.com/v3/verified_senders', {
          headers: {
            Authorization: `Bearer ${sendgridParentKey}`,
            'on-behalf-of': sgConfig.subuser_username,
          },
        });
        if (verifiedRes.ok) {
          const verifiedData = await verifiedRes.json();
          const senders = verifiedData.results || [];
          const matchedSender = senders.find(
            (s: any) => s.from_email?.toLowerCase() === senderEmail.toLowerCase()
          );
          if (matchedSender?.verified || isDomainVerifiedForSender) {
            if (isDomainVerifiedForSender && !matchedSender?.verified) {
              logStep('Domain is authenticated; bypassing single sender verification', {
                senderEmail,
                domain: senderDomain,
              });
            }

            // Sync to DB if not already marked
            await adminClient
              .from('sender_identities')
              .update({ is_verified: true, updated_at: new Date().toISOString() })
              .eq('workspace_id', workspace_id)
              .eq('sender_email', senderEmail.toLowerCase())
              .eq('is_verified', false);
          } else {
            logStep('Sender not verified in SendGrid', { senderEmail });
            return new Response(JSON.stringify({
              error: `Sender ${senderEmail} is not verified. Check your inbox for the verification email from SendGrid.`,
            }), {
              status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (e) {
        logStep('Sender verification check failed (non-fatal)', { error: e instanceof Error ? e.message : String(e) });
      }
    } else if (isDomainVerifiedForSender) {
      // No parent key available, just sync DB
      await adminClient
        .from('sender_identities')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id)
        .eq('sender_email', senderEmail.toLowerCase())
        .eq('is_verified', false);
    }
    // Get default signature
    const { data: signature } = await adminClient
      .from('email_signatures')
      .select('html_content')
      .eq('workspace_id', workspace_id)
      .eq('is_default', true)
      .maybeSingle();

    // Get workspace booking link
    const { data: wsData } = await adminClient
      .from('workspaces')
      .select('booking_link')
      .eq('id', workspace_id)
      .maybeSingle();

    const bookingLinkHtml = wsData?.booking_link
      ? `<p style="margin:8px 0 0 0;font-size:14px;line-height:1.6;color:#333;">📅 <a href="${wsData.booking_link}" style="color:#E91E8C;text-decoration:underline;">Book a call with us</a></p>`
      : '';

    // Build full email HTML
    const signatureHtml = signature?.html_content
      ? stripLeadingSignatureSpace(signature.html_content)
      : '';

    // Generate a unique message ID for reply tracking
    const messageUuid = crypto.randomUUID();
    const replyToEmail = `reply+${messageUuid}@reply.autosocials.com`;

    const cleanedBodyHtml = normalizeLastParagraphSpacing(
      stripLegacyHtmlSignoff(body_html)
        .replace(/(<br\s*\/?\s*>\s*)+$/i, ''),
    );

    const fullHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;">
        ${cleanedBodyHtml}
        ${bookingLinkHtml}
        <br />${signatureHtml}
      </div>
    `;

    logStep('Sending email', { to: to_email, from: senderEmail, subject });

    // Resolve BCC recipients from notification_recipients table
    const { data: bccRecipients } = await adminClient
      .from('notification_recipients')
      .select('email')
      .eq('workspace_id', workspace_id)
      .eq('bcc_on_campaigns', true);

    const bccList: { email: string }[] = [];
    if (bccRecipients?.length) {
      for (const r of bccRecipients) {
        const bccAddr = r.email.trim().toLowerCase();
        if (bccAddr && bccAddr !== to_email.toLowerCase()) {
          bccList.push({ email: bccAddr });
        }
      }
      if (bccList.length > 0) logStep('BCC recipients', { count: bccList.length, emails: bccList.map(b => b.email) });
    }

    const personalization: Record<string, any> = {
      to: [{ email: to_email, name: to_name || undefined }],
    };
    if (bccList.length > 0) personalization.bcc = bccList;

    const sendPayload = {
      personalizations: [personalization],
      from: { email: senderEmail, name: senderName },
      reply_to: { email: replyToEmail },
      subject,
      content: [{ type: 'text/html', value: fullHtml }],
      ip_pool_name: 'autosocials_pool',
      tracking_settings: {
        open_tracking: { enable: true },
        click_tracking: { enable: true },
      },
      custom_args: {
        message_uuid: messageUuid,
        workspace_id,
        platform: 'autosocials',
      },
    };

    const sendWithApiKey = async (apiKey: string, onBehalfOf?: string) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (onBehalfOf) headers['on-behalf-of'] = onBehalfOf;

      return fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(sendPayload),
      });
    };

    // Primary send via subuser key
    let sgResponse = await sendWithApiKey(sgConfig.api_key);
    let errBody = '';

    if (!sgResponse.ok) {
      errBody = await sgResponse.text();

      const senderIdentityMismatch = errBody.includes('from address does not match a verified Sender Identity');
      const canRetryViaParent =
        senderIdentityMismatch &&
        isDomainVerifiedForSender &&
        !!sendgridParentKey &&
        !!sgConfig.subuser_username;

      if (canRetryViaParent) {
        logStep('Subuser send rejected with sender mismatch; retrying via parent on-behalf-of', {
          senderEmail,
          subuser: sgConfig.subuser_username,
        });

        sgResponse = await sendWithApiKey(sendgridParentKey!, sgConfig.subuser_username);
        if (!sgResponse.ok) {
          errBody = await sgResponse.text();
        } else {
          errBody = '';
        }
      }
    }

    if (!sgResponse.ok) {
      logStep('SendGrid error', { status: sgResponse.status, error: errBody });

      // Log failed send
      await adminClient.from('email_send_log').insert({
        workspace_id,
        sender_identity_id: resolvedIdentityId,
        to_email,
        to_name: to_name || null,
        subject,
        body_html: cleanedBodyHtml,
        message_id: messageUuid,
        status: 'failed',
      });

      return new Response(JSON.stringify({ error: `Email send failed: ${errBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log successful send
    await adminClient.from('email_send_log').insert({
      workspace_id,
      sender_identity_id: resolvedIdentityId,
      to_email,
      to_name: to_name || null,
      subject,
      body_html: cleanedBodyHtml,
      message_id: messageUuid,
      status: 'sent',
    });

    // Increment today's sending metrics
    const today = new Date().toISOString().substring(0, 10);
    const { data: existingMetrics } = await adminClient
      .from('workspace_sending_metrics')
      .select('id, emails_sent')
      .eq('workspace_id', workspace_id)
      .eq('metric_date', today)
      .maybeSingle();

    if (existingMetrics) {
      await adminClient
        .from('workspace_sending_metrics')
        .update({ emails_sent: existingMetrics.emails_sent + 1 })
        .eq('id', existingMetrics.id);
    } else {
      await adminClient
        .from('workspace_sending_metrics')
        .insert({ workspace_id, metric_date: today, emails_sent: 1 });
    }

    // Update lifetime sends
    await adminClient
      .from('workspace_sendgrid_config')
      .update({
        total_sends_lifetime: (sgConfig.total_sends_lifetime || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspace_id);

    logStep('Email sent successfully', { messageId: messageUuid, to: to_email });

    if (runId) {
      try {
        await appendEvent({
          runId,
          workspaceId: workspace_id,
          seq: seq(),
          kind: 'tool_result',
          name: 'outreach.send_email',
          ok: true,
          outputs: { message_id: messageUuid, to: to_email },
        });
        await finalizeRun({ runId, state: 'complete', response: { message_id: messageUuid } });
      } catch (e) {
        console.warn('[SEND-EMAIL] trace finalize failed (non-fatal):', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: messageUuid,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
