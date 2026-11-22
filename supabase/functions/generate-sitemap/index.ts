import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Canonical host: apex domain (www permanently redirects here).
const SITE_URL = "https://autosocials.com";

// Public, indexable marketing pages. Keep in sync with src/lib/seo-routes.ts.
const STATIC_PAGES = ["/", "/discover", "/pricing", "/agency-platform", "/agency-signup"];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Paginate: the backend caps each request at 1000 rows.
    const pages: { slug: string; updated_at: string | null }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from("public_creator_pages")
        .select("slug, updated_at")
        .eq("status", "published")
        .eq("is_indexable", true)
        .order("slug", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error; // never return a partial sitemap
      pages.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const seen = new Set<string>();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const path of STATIC_PAGES) {
      const loc = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
      seen.add(loc);
      xml += `  <url><loc>${loc}</loc></url>\n`;
    }

    for (const p of pages) {
      if (!p.slug) continue;
      const loc = `${SITE_URL}/${esc(p.slug.replace(/^\/+/, ""))}`;
      if (seen.has(loc)) continue;
      seen.add(loc);
      // lastmod only from the page's own update timestamp.
      const lastmod = p.updated_at
        ? `<lastmod>${new Date(p.updated_at).toISOString().split("T")[0]}</lastmod>`
        : "";
      xml += `  <url><loc>${loc}</loc>${lastmod}</url>\n`;
    }

    xml += `</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Error generating sitemap", { status: 500 });
  }
});
