import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const { workspace_id, signature_html, to_email } = await req.json();
    if (!workspace_id || !signature_html || !to_email) {
      return new Response(JSON.stringify({ error: 'workspace_id, signature_html, and to_email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isMember } = await adminClient.rpc('is_workspace_member', {
      _user_id: userId,
      _workspace_id: workspace_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sgConfig } = await adminClient
      .from('workspace_sendgrid_config')
      .select('api_key')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (!sgConfig?.api_key) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get default sender identity
    const { data: defaultIdentity } = await adminClient
      .from('sender_identities')
      .select('sender_email, sender_name')
      .eq('workspace_id', workspace_id)
      .eq('is_default', true)
      .maybeSingle();

    const fromEmail = defaultIdentity?.sender_email || 'info@autosocials.com';
    const fromName = defaultIdentity?.sender_name || 'AutoSocials';

    const fullHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;">
        <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">
          This is a test email to preview your signature. Here's how it will appear below your outgoing emails:
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        ${signature_html}
      </div>
    `;

    const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sgConfig.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to_email }] }],
        from: { email: fromEmail, name: fromName },
        subject: 'Test: Email Signature Preview',
        content: [{ type: 'text/html', value: fullHtml }],
        ip_pool_name: 'autosocials_pool',
      }),
    });

    if (!sgResponse.ok) {
      const errBody = await sgResponse.text();
      return new Response(JSON.stringify({ error: `SendGrid error: ${errBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
