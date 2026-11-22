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

    const { image_url, workspace_id } = await req.json();
    if (!image_url || !workspace_id) {
      return new Response(JSON.stringify({ error: 'image_url and workspace_id required' }), {
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

    // Fetch image server-side (bypasses CORS)
    const imgResponse = await fetch(image_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AutoSocials/1.0)',
        'Accept': 'image/*,*/*',
        'Referer': image_url,
      },
      redirect: 'follow',
    });

    if (!imgResponse.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch image: ${imgResponse.status}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawContentType = imgResponse.headers.get('content-type') || '';
    // Extract just the mime type, stripping charset or other params
    const contentType = rawContentType.split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      return new Response(JSON.stringify({ error: `Not an image: ${rawContentType}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageBytes = new Uint8Array(await imgResponse.arrayBuffer());
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('svg') ? 'svg'
      : 'jpg';

    const fileName = `${workspace_id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await adminClient.storage
      .from('email-assets')
      .upload(fileName, imageBytes, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Upload failed: ${uploadError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrlData } = adminClient.storage
      .from('email-assets')
      .getPublicUrl(fileName);

    return new Response(JSON.stringify({ public_url: publicUrlData.publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
