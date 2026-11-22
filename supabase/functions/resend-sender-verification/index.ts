import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[RESEND-SENDER-VERIFY] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

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

    if (!sendgridParentKey) {
      return new Response(JSON.stringify({ error: 'SendGrid not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { workspace_id, sender_email, sender_name, contact_name } = await req.json();
    if (!workspace_id || !sender_email) {
      return new Response(JSON.stringify({ error: 'workspace_id and sender_email are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is workspace owner
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isOwner } = await adminClient.rpc('is_workspace_owner', {
      _user_id: userId,
      _workspace_id: workspace_id,
    });
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Only workspace owners can manage senders' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get subuser config
    const { data: sgConfig } = await adminClient
      .from('workspace_sendgrid_config')
      .select('api_key, subuser_username')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (!sgConfig) {
      return new Response(JSON.stringify({ error: 'Email infrastructure not provisioned yet. Complete Domain Authentication first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subuserApiKey = sgConfig.api_key;
    const subuserUsername = sgConfig.subuser_username;
    const senderDomain = sender_email.toLowerCase().split('@')[1];

    // If workspace domain is already authenticated, this sender is verified automatically.
    const { data: domainRecord } = await adminClient
      .from('workspace_domains')
      .select('domain, status')
      .eq('workspace_id', workspace_id)
      .ilike('domain', senderDomain)
      .maybeSingle();

    if (domainRecord?.status === 'verified') {
      await adminClient
        .from('sender_identities')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id)
        .eq('sender_email', sender_email.toLowerCase());

      logStep('Sender auto-verified via domain authentication', { sender_email, domain: senderDomain });
      return new Response(JSON.stringify({
        success: true,
        domain_verified: true,
        note: `Domain ${senderDomain} is already verified. No SendGrid sender verification email is required.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep('Checking existing verified senders', { sender_email, subuser: subuserUsername });

    // Check existing verified senders on the subuser
    const listRes = await fetch('https://api.sendgrid.com/v3/verified_senders', {
      headers: {
        Authorization: `Bearer ${sendgridParentKey}`,
        'on-behalf-of': subuserUsername,
      },
    });

    if (!listRes.ok) {
      const errBody = await listRes.text();
      logStep('Failed to list verified senders', { status: listRes.status, error: errBody });
      return new Response(JSON.stringify({ error: 'Failed to check sender status' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const listData = await listRes.json();
    const existingSenders = listData.results || [];
    const existingSender = existingSenders.find(
      (s: any) => s.from_email?.toLowerCase() === sender_email.toLowerCase()
    );

    if (existingSender && existingSender.verified) {
      logStep('Sender already verified', { sender_email });
      // Update DB to reflect verified status
      await adminClient
        .from('sender_identities')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id)
        .eq('sender_email', sender_email.toLowerCase());

      return new Response(JSON.stringify({ success: true, already_verified: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (existingSender && !existingSender.verified) {
      // Resend verification for existing unverified sender
      logStep('Resending verification', { sender_id: existingSender.id, sender_email });
      const resendRes = await fetch(
        `https://api.sendgrid.com/v3/verified_senders/resend/${existingSender.id}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridParentKey}`,
            'on-behalf-of': subuserUsername,
          },
        }
      );

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        logStep('Failed to resend verification', { status: resendRes.status, error: errBody });
        return new Response(JSON.stringify({ error: 'Failed to resend verification email' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      logStep('Verification email resent', { sender_email });
      return new Response(JSON.stringify({ success: true, resent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sender doesn't exist in SendGrid yet — create it
    logStep('Creating new verified sender', { sender_email, sender_name });

    // Get workspace details for reply_to
    const { data: workspace } = await adminClient
      .from('workspaces')
      .select('name, address')
      .eq('id', workspace_id)
      .maybeSingle();

    const fromName = sender_name || workspace?.name || 'Team';
    const replyTo = sender_email;
    // Use email as nickname to avoid "already exists" collisions
    const nickname = `${sender_email.toLowerCase()}-${subuserUsername}`;

    const createRes = await fetch('https://api.sendgrid.com/v3/verified_senders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridParentKey}`,
        'Content-Type': 'application/json',
        'on-behalf-of': subuserUsername,
      },
      body: JSON.stringify({
        nickname: nickname,
        from_email: sender_email.toLowerCase(),
        from_name: fromName,
        reply_to: replyTo.toLowerCase(),
        reply_to_name: fromName,
        address: workspace?.address || '123 Main St',
        city: 'London',
        country: 'GB',
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      logStep('Failed to create verified sender', { status: createRes.status, error: errBody });

      // If nickname/email already exists (400 or 409), tell user to check inbox
      if (createRes.status === 409 || (createRes.status === 400 && errBody.includes('already exists'))) {
        return new Response(JSON.stringify({ success: true, resent: true, note: 'Sender already exists in SendGrid. Check your inbox for the verification email.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Failed to create sender: ${errBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep('Verified sender created, verification email sent', { sender_email });

    return new Response(JSON.stringify({ success: true, created: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
