import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SS_BASE = "https://api.shutterstock.com/v2";
const USER_TOKEN = Deno.env.get("SHUTTERSTOCK_USER_TOKEN")!;

let cachedSubscriptionId: string | null = null;

async function getSubscriptionId(): Promise<string | null> {
  if (cachedSubscriptionId) return cachedSubscriptionId;
  const res = await fetch(`${SS_BASE}/user/subscriptions`, {
    headers: { Authorization: `Bearer ${USER_TOKEN}` },
  });
  if (!res.ok) {
    console.error("subscriptions failed", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  const sub =
    (j.data || []).find((s: any) => s.is_active) || j.data?.[0];
  cachedSubscriptionId = sub?.id || null;
  return cachedSubscriptionId;
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isPreviewUrl(u: string): boolean {
  return /\/preview\/|\bwm\b|image\.shutterstock\.com\/z\//i.test(u);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as "search" | "license";

    if (action === "search") {
      const { query, page = 1, orientation } = body;
      if (!query) {
        return new Response(JSON.stringify({ error: "query required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const params = new URLSearchParams({
        query,
        page: String(page),
        per_page: "24",
        sort: "popular",
        view: "minimal",
      });
      if (orientation) params.set("orientation", orientation);
      const res = await fetch(`${SS_BASE}/images/search?${params}`, {
        headers: { Authorization: `Bearer ${USER_TOKEN}` },
      });
      const j = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: j }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const results = (j.data || []).map((d: any) => ({
        id: d.id,
        description: d.description,
        preview: d.assets?.preview?.url || d.assets?.preview_1000?.url,
        width: d.assets?.preview?.width,
        height: d.assets?.preview?.height,
      }));
      return new Response(
        JSON.stringify({ results, page: j.page, total: j.total_count }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "license") {
      const { image_id, brand, region, scene, page_slug, workspace_id, query } = body;
      if (!image_id || !brand || !scene) {
        return new Response(
          JSON.stringify({ error: "image_id, brand, scene required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // auth user
      const authHeader = req.headers.get("Authorization") || "";
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscriptionId = await getSubscriptionId();
      if (!subscriptionId) {
        return new Response(
          JSON.stringify({ error: "No active Shutterstock subscription" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // license
      const licRes = await fetch(
        `${SS_BASE}/images/licenses?subscription_id=${subscriptionId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${USER_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            images: [{ image_id, size: "huge" }],
          }),
        }
      );
      const licJson = await licRes.json();
      if (!licRes.ok) {
        console.error("license failed", licJson);
        return new Response(JSON.stringify({ error: licJson }), {
          status: licRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const licData = licJson.data?.[0];
      const downloadUrl = licData?.download?.url;
      const licenseId = licData?.license_id || licData?.id;
      if (!downloadUrl || isPreviewUrl(downloadUrl)) {
        return new Response(
          JSON.stringify({ error: "No clean download URL returned" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // download clean file
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        return new Response(JSON.stringify({ error: "download failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      const mime = fileRes.headers.get("content-type") || "image/jpeg";
      const ext = mime.includes("png") ? "png" : "jpg";

      const filename = `${slugify(brand)}-${slugify(page_slug || scene)}-${image_id}.${ext}`;
      const storagePath = `${userId}/${Date.now()}-${filename}`;

      // upload using service role to bypass policies cleanly
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { error: upErr } = await admin.storage
        .from("media")
        .upload(storagePath, bytes, { contentType: mime, upsert: false });
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: pub } = admin.storage.from("media").getPublicUrl(storagePath);
      const publicUrl = pub.publicUrl;
      if (isPreviewUrl(publicUrl)) {
        return new Response(JSON.stringify({ error: "preview url blocked" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const alt = `${brand}${region ? `, ${region}` : ""} — ${scene}`.slice(0, 200);

      const { data: row, error: insErr } = await admin
        .from("media_assets")
        .insert({
          workspace_id: workspace_id || null,
          created_by: userId,
          source: "shutterstock",
          image_id: String(image_id),
          license_id: licenseId ? String(licenseId) : null,
          storage_path: storagePath,
          public_url: publicUrl,
          alt,
          filename,
          query: query || null,
          mime_type: mime,
        })
        .select()
        .single();
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ asset: row }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});