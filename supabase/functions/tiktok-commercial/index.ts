import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2/research/adlib";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY is not configured");
  if (!clientSecret) throw new Error("TIKTOK_CLIENT_SECRET is not configured");

  console.log("Requesting TikTok access token...");

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const data = await res.json();
  console.log("Token response status:", res.status, "has token:", !!data.access_token, "token_type:", data.token_type, "scope:", data.scope, "expires_in:", data.expires_in);

  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token error [${res.status}]: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 7200) * 1000;
  return cachedToken!;
}

function isTikTokInternalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("TikTok API error [500]") && message.includes('"code":"internal_error"');
}

function normalizeCommercialContentToAds(result: unknown): { data: { ads: unknown[]; has_more: boolean; search_id: string | null } } {
  const payload = result as {
    data?: {
      commercial_contents?: Array<{
        create_date?: string;
        brand_names?: string[];
        creator?: { username?: string; nickname?: string };
        videos?: Array<{ cover_image_url?: string; video_url?: string; url?: string }>;
      }>;
      has_more?: boolean;
      search_id?: string;
    };
  };

  const ads = (payload.data?.commercial_contents || []).map((item) => {
    const firstVideo = item.videos?.[0];
    const brandName = item.brand_names?.find((b) => typeof b === "string" && b.trim().length > 0);
    const advertiserName = brandName || item.creator?.username || item.creator?.nickname || "Unknown";

    return {
      ad: {
        first_shown_date: item.create_date,
        last_shown_date: item.create_date,
        status: "active",
        videos: firstVideo
          ? [{ cover_image_url: firstVideo.cover_image_url, video_url: firstVideo.video_url || firstVideo.url }]
          : [],
      },
      advertiser: {
        business_name: advertiserName,
        paid_for_by: brandName,
      },
    };
  });

  return {
    data: {
      ads,
      has_more: Boolean(payload.data?.has_more),
      search_id: payload.data?.search_id || null,
    },
  };
}

async function tiktokRequest(path: string, body: Record<string, unknown>, fields: string, retries = 2): Promise<unknown> {
  const token = await getAccessToken();
  const url = `${TIKTOK_API_BASE}${path}?fields=${encodeURIComponent(fields)}`;

  console.log("TikTok API request:", url, JSON.stringify(body));

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      return data;
    }

    // If TikTok returns 500 (internal error), retry after a brief delay
    if (res.status === 500 && attempt < retries) {
      console.warn(`TikTok API 500 error (attempt ${attempt + 1}/${retries + 1}), retrying in 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    throw new Error(`TikTok API error [${res.status}]: ${JSON.stringify(data)}`);
  }

  throw new Error("TikTok API request failed after retries");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth using getUser
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { action, ...params } = await req.json();

    let result: unknown;

    switch (action) {
      case "search_ads": {
        const { search_term, country, date_min, date_max, max_count, search_id, advertiser_business_ids } = params;
        const filters: Record<string, unknown> = {
          ad_published_date_range: {
            min: date_min || "20221001",
            max: date_max || getYesterday(),
          },
        };
        if (country && country !== "all") {
          filters.country = [country];
        }
        if (advertiser_business_ids && !search_term) {
          filters.advertiser_business_ids = Array.isArray(advertiser_business_ids) ? advertiser_business_ids : [advertiser_business_ids];
        }

        const body: Record<string, unknown> = {
          filters,
          max_count: max_count || 50,
        };
        if (search_term) body.search_term = search_term;
        if (search_id) body.search_id = search_id;

        try {
          result = await tiktokRequest(
            "/ad/query/",
            body,
            "ad.id,ad.first_shown_date,ad.last_shown_date,ad.reach,ad.image_urls,ad.videos,ad.status,ad.status_statement,advertiser.business_name,advertiser.business_id,advertiser.paid_for_by"
          );
        } catch (error: unknown) {
          if (!isTikTokInternalError(error)) {
            throw error;
          }

          // Fallback: ad/query can be unstable for some approved commercial API apps.
          // We degrade gracefully by using commercial content search and normalizing into ads shape.
          console.warn("ad/query returned internal_error, falling back to commercial_content/query");

          const fallbackFilters: Record<string, unknown> = {
            content_published_date_range: {
              min: date_min || "20221001",
              max: date_max || getYesterday(),
            },
          };
          if (country && country !== "all") {
            fallbackFilters.country = [country];
          }

          const fallbackBody: Record<string, unknown> = {
            filters: fallbackFilters,
            max_count: max_count || 50,
          };
          if (search_term) fallbackBody.search_term = search_term;
          if (search_id) fallbackBody.search_id = search_id;

          const fallbackResult = await tiktokRequest(
            "/commercial_content/query/",
            fallbackBody,
            "id,create_date,create_timestamp,brand_names,creator,videos,label"
          );
          result = normalizeCommercialContentToAds(fallbackResult);
        }
        break;
      }

      case "ad_detail": {
        const { ad_id } = params;
        if (!ad_id) throw new Error("ad_id is required");
        result = await tiktokRequest(
          "/ad/detail/",
          { ad_id: Number(ad_id) },
          "ad.id,ad.first_shown_date,ad.last_shown_date,ad.reach,ad.image_urls,ad.videos,ad.status,ad.status_statement,ad_group.targeting_info,advertiser.business_name,advertiser.business_id,advertiser.profile_url,advertiser.avatar_url,advertiser.follower_count,advertiser.paid_for_by"
        );
        break;
      }

      case "search_advertisers": {
        const { search_term, max_count, search_id } = params;
        if (!search_term) throw new Error("search_term is required");
        const body: Record<string, unknown> = {
          search_term,
          max_count: max_count || 50,
        };
        if (search_id) body.search_id = search_id;

        try {
          result = await tiktokRequest(
            "/advertiser/query/",
            body,
            "business_id,business_name,country_code"
          );
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          // TikTok returns 400 "No advertisers were found" — return empty result instead of error
          if (msg.includes("No advertisers were found") || msg.includes("invalid_params")) {
            result = { data: { advertisers: [] } };
          } else {
            throw error;
          }
        }
        break;
      }

      case "search_commercial_content": {
        const { search_term, country, date_min, date_max, max_count, search_id } = params;
        const filters: Record<string, unknown> = {
          content_published_date_range: {
            min: date_min || "20221001",
            max: date_max || getYesterday(),
          },
        };
        if (country && country !== "all") {
          filters.country = [country];
        }

        const body: Record<string, unknown> = {
          filters,
          max_count: max_count || 50,
        };
        if (search_term) body.search_term = search_term;
        if (search_id) body.search_id = search_id;

        result = await tiktokRequest(
          "/commercial_content/query/",
          body,
          "id,create_date,create_timestamp,brand_names,creator,videos,label"
        );
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("TikTok Commercial API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
