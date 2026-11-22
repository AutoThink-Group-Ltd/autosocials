import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[PROVISION-SUBUSER] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
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
      return new Response(JSON.stringify({ error: 'Only workspace owners can provision email' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already provisioned
    const { data: existing } = await adminClient
      .from('workspace_sendgrid_config')
      .select('id, subuser_username')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (existing) {
      logStep('Already provisioned', { workspace_id, subuser: existing.subuser_username });
      return new Response(JSON.stringify({ success: true, already_exists: true, subuser_username: existing.subuser_username }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create SendGrid subuser
    const subuserUsername = `as_${workspace_id.replace(/-/g, '').substring(0, 20)}`;
    // Generate a random password for the subuser
    const subuserPassword = crypto.randomUUID() + 'Aa1!';

    // Get user email for the subuser
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();

    const { data: userRecord } = await adminClient.auth.admin.getUserById(userId);
    const userEmail = userRecord?.user?.email || 'noreply@autosocials.com';

    logStep('Creating SendGrid subuser', { subuserUsername, email: userEmail });

    // Step 1: Create subuser
    const createSubuserRes = await fetch('https://api.sendgrid.com/v3/subusers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridParentKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: subuserUsername,
        email: userEmail,
        password: subuserPassword,
        ips: ['159.183.42.93'],
      }),
    });

    if (!createSubuserRes.ok) {
      const errBody = await createSubuserRes.text();
      logStep('Failed to create subuser', { status: createSubuserRes.status, error: errBody });
      // If subuser already exists in SendGrid, proceed to create API key
      if (createSubuserRes.status !== 409) {
        return new Response(JSON.stringify({ error: `SendGrid error: ${errBody}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const subuserData = createSubuserRes.ok ? await createSubuserRes.json() : null;
    const subuserId = subuserData?.user_id || 0;
    logStep('Subuser created', { subuserId, username: subuserUsername });

    // Step 2: Create API key for the subuser using on-behalf-of header
    const createKeyRes = await fetch('https://api.sendgrid.com/v3/api_keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridParentKey}`,
        'Content-Type': 'application/json',
        'on-behalf-of': subuserUsername,
      },
      body: JSON.stringify({
        name: `autosocials_${subuserUsername}`,
        scopes: [
          'mail.send',
          'sender_verification_eligible',
          'whitelabel.create',
          'whitelabel.read',
          'whitelabel.update',
          'whitelabel.delete',
        ],
      }),
    });

    if (!createKeyRes.ok) {
      const errBody = await createKeyRes.text();
      logStep('Failed to create API key', { status: createKeyRes.status, error: errBody });
      return new Response(JSON.stringify({ error: `Failed to create subuser API key: ${errBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const keyData = await createKeyRes.json();
    const subuserApiKey = keyData.api_key;
    logStep('Subuser API key created');

    // Step 3: Store in database
    const { error: insertError } = await adminClient
      .from('workspace_sendgrid_config')
      .insert({
        workspace_id,
        subuser_username: subuserUsername,
        subuser_id: subuserId,
        api_key: subuserApiKey,
        ip_pool: 'autosocials_pool',
        warmup_stage: 'onboarding',
      });

    if (insertError) {
      logStep('Failed to store config', { error: insertError.message });
      return new Response(JSON.stringify({ error: 'Failed to save configuration' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep('Provisioning complete', { workspace_id, subuser: subuserUsername });

    return new Response(JSON.stringify({
      success: true,
      subuser_username: subuserUsername,
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
