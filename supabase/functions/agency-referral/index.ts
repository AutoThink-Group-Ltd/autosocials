import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, ...params } = await req.json();

    // ─── RESOLVE: public, returns agency info for a referral code ───
    if (action === "resolve") {
      const { code } = params;
      if (!code) throw new Error("code required");

      const { data: profile } = await supabase
        .from("agency_profiles")
        .select("id, agency_name, agency_logo_url, contact_name, contact_email, booking_url")
        .eq("referral_code", code)
        .single();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Invalid referral code" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ profile }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TRACK_CLICK: public, records click and increments counters ───
    if (action === "track_click") {
      const { code, slug, user_agent, referrer } = params;
      if (!code) throw new Error("code required");

      const { data: profile } = await supabase
        .from("agency_profiles")
        .select("id, user_id, agency_name")
        .eq("referral_code", code)
        .single();

      if (!profile) throw new Error("Invalid referral code");

      let referralLinkId: string | null = null;

      // If slug provided, find and increment the specific link
      if (slug) {
        const { data: link } = await supabase
          .from("agency_referral_links")
          .select("id, click_count")
          .eq("agency_profile_id", profile.id)
          .eq("slug", slug)
          .eq("is_active", true)
          .single();

        if (link) {
          referralLinkId = link.id;
          await supabase
            .from("agency_referral_links")
            .update({
              click_count: (link.click_count || 0) + 1,
              last_clicked_at: new Date().toISOString(),
            })
            .eq("id", link.id);
        }
      }

      // Record the click
      await supabase.from("agency_referral_clicks").insert({
        agency_profile_id: profile.id,
        referral_code: code,
        referral_link_id: referralLinkId,
        slug: slug || null,
        user_agent: user_agent || null,
        referrer: referrer || null,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LINK_ACCOUNT: authenticated, links new user to agency ───
    if (action === "link_account") {
      const { code, slug, user_id } = params;
      if (!code || !user_id) throw new Error("code and user_id required");

      const { data: profile } = await supabase
        .from("agency_profiles")
        .select("id, user_id, agency_name, contact_email")
        .eq("referral_code", code)
        .single();

      if (!profile) throw new Error("Invalid referral code");

      // Get user info
      const { data: { user } } = await supabase.auth.admin.getUserById(user_id);
      if (!user) throw new Error("User not found");

      // Get user's workspace
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .eq("role", "owner")
        .single();

      const workspaceId = membership?.workspace_id;
      if (!workspaceId) throw new Error("User has no workspace");

      // Create agency_clients record
      const { data: clientRecord } = await supabase
        .from("agency_clients")
        .insert({
          agency_user_id: profile.user_id,
          client_user_id: user_id,
          workspace_id: workspaceId,
          client_name: user.user_metadata?.company_name || user.email?.split("@")[0] || "Client",
          client_contact_name: user.user_metadata?.full_name || null,
          client_contact_email: user.email,
          status: "active",
        })
        .select("id")
        .single();

      // Create agency_client_links
      await supabase.from("agency_client_links").insert({
        agency_user_id: profile.user_id,
        client_user_id: user_id,
        workspace_id: workspaceId,
        agency_client_id: clientRecord?.id,
        status: "active",
      });

      // Add agency user as admin member of client workspace
      await supabase.from("workspace_members").upsert({
        workspace_id: workspaceId,
        user_id: profile.user_id,
        role: "admin",
      }, { onConflict: "user_id,workspace_id" });

      // Increment signup_count on the matching referral link
      if (slug) {
        const { data: link } = await supabase
          .from("agency_referral_links")
          .select("id, signup_count")
          .eq("agency_profile_id", profile.id)
          .eq("slug", slug)
          .single();

        if (link) {
          await supabase
            .from("agency_referral_links")
            .update({ signup_count: (link.signup_count || 0) + 1 })
            .eq("id", link.id);
        }
      }

      // Log activity
      await supabase.from("agency_activity_log").insert({
        agency_user_id: profile.user_id,
        actor_user_id: profile.user_id,
        action_type: "referral_signup",
        action_label: `New referral signup: ${user.email}`,
        client_name: user.user_metadata?.company_name || user.email,
        workspace_id: workspaceId,
      });

      // Send notification email to agency owner
      const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
      if (sendgridKey && profile.contact_email) {
        const html = `<p>Great news! A new client has signed up through your referral link.</p>
          <p><strong>Email:</strong> ${user.email}<br/>
          <strong>Name:</strong> ${user.user_metadata?.full_name || "Not provided"}<br/>
          <strong>Source:</strong> Referral link${slug ? ` (${slug})` : ""}</p>
          <p>They've been automatically linked to your agency. Visit your dashboard to see them.</p>`;

        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: profile.contact_email }] }],
            from: { email: "info@autosocials.com", name: "AutoSocials" },
            subject: `New Referral Signup — ${user.email}`,
            content: [{ type: "text/html", value: html }],
            ip_pool_name: "autosocials_pool",
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
