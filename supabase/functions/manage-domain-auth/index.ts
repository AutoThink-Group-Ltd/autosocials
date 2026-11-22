import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[DOMAIN-AUTH] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

async function sgFetch(path: string, apiKey: string, opts?: { method?: string; body?: unknown; onBehalfOf?: string }) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (opts?.onBehalfOf) headers['on-behalf-of'] = opts.onBehalfOf;
  const init: RequestInit = { method: opts?.method || 'GET', headers };
  if (opts?.body) init.body = JSON.stringify(opts.body);
  return fetch(`https://api.sendgrid.com/v3${path}`, init);
}

/** Check if a domain is already authenticated at the parent SendGrid account level */
async function checkParentDomainAuth(domain: string, parentKey: string) {
  const res = await sgFetch('/whitelabel/domains', parentKey);
  if (!res.ok) return null;
  const domains = await res.json();
  if (!Array.isArray(domains)) return null;
  return domains.find((d: any) => d.domain === domain && d.valid === true) || null;
}

/** Delete a subuser-level domain auth by ID */
async function deleteSubuserDomainAuth(domainId: number, parentKey: string, subuserUsername: string) {
  const res = await sgFetch(`/whitelabel/domains/${domainId}`, parentKey, {
    method: 'DELETE',
    onBehalfOf: subuserUsername,
  });
  logStep('Deleted subuser domain auth', { domainId, ok: res.ok });
  await res.text(); // consume body
}

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
    const { action, workspace_id, domain } = body;

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isOwner } = await adminClient.rpc('is_workspace_owner', {
      _user_id: userId,
      _workspace_id: workspace_id,
    });
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sgConfig } = await adminClient
      .from('workspace_sendgrid_config')
      .select('subuser_username, api_key')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (!sgConfig) {
      return new Response(JSON.stringify({ error: 'Email not provisioned. Please set up email first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'authenticate') {
      if (!domain) {
        return new Response(JSON.stringify({ error: 'domain is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      logStep('Authenticating domain', { domain, subuser: sgConfig.subuser_username });

      // ── Step 1: Check parent-level domain auth first ──
      const parentAuth = await checkParentDomainAuth(domain, sendgridParentKey);
      if (parentAuth) {
        logStep('Domain already authenticated at parent level', { domain, id: parentAuth.id });

        // Store as verified (inherited) in workspace_domains
        await adminClient
          .from('workspace_domains')
          .upsert({
            workspace_id,
            domain,
            sendgrid_domain_id: parentAuth.id,
            status: 'verified',
            dns_records: [],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'workspace_id,domain' });

        // Auto-verify sender identities on this domain
        await adminClient
          .from('sender_identities')
          .update({ is_verified: true, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspace_id)
          .ilike('sender_email', `%@${domain}`);

        return new Response(JSON.stringify({
          success: true,
          domain,
          inherited: true,
          valid: true,
          sendgrid_domain_id: parentAuth.id,
          dns_records: [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Step 2: Check subuser-level auth ──
      const subuserRes = await sgFetch('/whitelabel/domains', sendgridParentKey, { onBehalfOf: sgConfig.subuser_username });
      if (subuserRes.ok) {
        const subuserDomains = await subuserRes.json();
        const existing = Array.isArray(subuserDomains) ? subuserDomains.find((d: any) => d.domain === domain) : null;
        if (existing?.valid) {
          logStep('Domain already authenticated at subuser level', { domain });
          await adminClient
            .from('workspace_domains')
            .upsert({
              workspace_id,
              domain,
              sendgrid_domain_id: existing.id,
              status: 'verified',
              dns_records: [],
              updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,domain' });

          return new Response(JSON.stringify({
            success: true,
            domain,
            inherited: false,
            valid: true,
            sendgrid_domain_id: existing.id,
            dns_records: [],
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── Step 3: No existing auth — create new domain authentication ──
      const sgRes = await sgFetch('/whitelabel/domains', sendgridParentKey, {
        method: 'POST',
        onBehalfOf: sgConfig.subuser_username,
        body: {
          domain,
          automatic_security: true,
          custom_dkim_selector: `as${workspace_id.replace(/-/g, '').substring(0, 6)}`,
        },
      });

      if (!sgRes.ok) {
        const errBody = await sgRes.text();
        logStep('Domain auth failed', { status: sgRes.status, error: errBody });
        return new Response(JSON.stringify({ error: `SendGrid error: ${errBody}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const sgData = await sgRes.json();
      logStep('Domain auth created', { sendgrid_id: sgData.id });

      const dnsRecords: any[] = [];
      if (sgData.dns) {
        for (const [key, value] of Object.entries(sgData.dns)) {
          const record = value as any;
          dnsRecords.push({
            type: record.type || 'CNAME',
            host: record.host,
            data: record.data,
            valid: record.valid || false,
            name: key,
          });
        }
      }

      await adminClient
        .from('workspace_domains')
        .upsert({
          workspace_id,
          domain,
          sendgrid_domain_id: sgData.id,
          status: 'pending',
          dns_records: dnsRecords,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,domain' });

      return new Response(JSON.stringify({
        success: true,
        domain,
        inherited: false,
        valid: false,
        sendgrid_domain_id: sgData.id,
        dns_records: dnsRecords,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'verify') {
      const { data: domainRecord } = await adminClient
        .from('workspace_domains')
        .select('*')
        .eq('workspace_id', workspace_id)
        .maybeSingle();

      if (!domainRecord) {
        return new Response(JSON.stringify({ error: 'No domain found to verify' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If already verified, just return success
      if (domainRecord.status === 'verified') {
        return new Response(JSON.stringify({ success: true, valid: true, status: 'verified' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Re-check parent auth first (domain may have been verified since creation)
      const parentAuth = await checkParentDomainAuth(domainRecord.domain, sendgridParentKey);
      if (parentAuth) {
        logStep('Domain now verified at parent level', { domain: domainRecord.domain });

        // Delete the duplicate subuser-level auth if it exists
        if (domainRecord.sendgrid_domain_id) {
          await deleteSubuserDomainAuth(domainRecord.sendgrid_domain_id, sendgridParentKey, sgConfig.subuser_username);
        }

        await adminClient
          .from('workspace_domains')
          .update({
            status: 'verified',
            sendgrid_domain_id: parentAuth.id,
            dns_records: [],
            updated_at: new Date().toISOString(),
          })
          .eq('id', domainRecord.id);

        await adminClient
          .from('sender_identities')
          .update({ is_verified: true, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspace_id)
          .ilike('sender_email', `%@${domainRecord.domain}`);

        return new Response(JSON.stringify({
          success: true,
          valid: true,
          status: 'verified',
          inherited: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!domainRecord.sendgrid_domain_id) {
        return new Response(JSON.stringify({ error: 'No domain authentication ID found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      logStep('Verifying domain', { sendgrid_id: domainRecord.sendgrid_domain_id });

      const sgRes = await sgFetch(
        `/whitelabel/domains/${domainRecord.sendgrid_domain_id}/validate`,
        sendgridParentKey,
        { method: 'POST', onBehalfOf: sgConfig.subuser_username },
      );

      const sgData = await sgRes.json();
      logStep('Verification result', sgData);

      const isValid = sgData.valid === true;
      const newStatus = isValid ? 'verified' : 'pending';

      const updatedRecords = (domainRecord.dns_records as any[])?.map((rec: any) => {
        const validationResult = sgData.validation_results?.[rec.name];
        return { ...rec, valid: validationResult?.valid ?? rec.valid };
      }) || [];

      await adminClient
        .from('workspace_domains')
        .update({
          status: newStatus,
          dns_records: updatedRecords,
          updated_at: new Date().toISOString(),
        })
        .eq('id', domainRecord.id);

      if (isValid) {
        await adminClient
          .from('sender_identities')
          .update({ is_verified: true, updated_at: new Date().toISOString() })
          .eq('workspace_id', workspace_id)
          .ilike('sender_email', `%@${domainRecord.domain}`);

        logStep('Domain verified, sender identities updated');
      }

      return new Response(JSON.stringify({
        success: true,
        valid: isValid,
        status: newStatus,
        dns_records: updatedRecords,
        validation_results: sgData.validation_results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'status') {
      const { data: domainRecord } = await adminClient
        .from('workspace_domains')
        .select('*')
        .eq('workspace_id', workspace_id)
        .maybeSingle();

      return new Response(JSON.stringify({ success: true, domain: domainRecord }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'cleanup') {
      // Clean up duplicate subuser-level domain auth for domains already verified at parent
      if (!domain) {
        return new Response(JSON.stringify({ error: 'domain is required for cleanup' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const parentAuth = await checkParentDomainAuth(domain, sendgridParentKey);
      if (!parentAuth) {
        return new Response(JSON.stringify({ error: 'Domain not authenticated at parent level' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find and delete subuser-level duplicate
      const subuserRes = await sgFetch('/whitelabel/domains', sendgridParentKey, { onBehalfOf: sgConfig.subuser_username });
      if (subuserRes.ok) {
        const subuserDomains = await subuserRes.json();
        const duplicate = Array.isArray(subuserDomains)
          ? subuserDomains.find((d: any) => d.domain === domain && d.id !== parentAuth.id)
          : null;
        if (duplicate) {
          await deleteSubuserDomainAuth(duplicate.id, sendgridParentKey, sgConfig.subuser_username);
        }
      }

      // Update local record to verified
      await adminClient
        .from('workspace_domains')
        .update({
          status: 'verified',
          sendgrid_domain_id: parentAuth.id,
          dns_records: [],
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspace_id)
        .eq('domain', domain);

      return new Response(JSON.stringify({ success: true, cleaned: true, domain }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: authenticate, verify, status, cleanup' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
