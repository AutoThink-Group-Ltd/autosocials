import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[DISCONNECT-AGENCY] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const clientUserId = userData.user.id;
    logStep("Client user authenticated", { clientUserId });

    const { workspace_id } = await req.json();
    if (!workspace_id) throw new Error("workspace_id is required");

    // Verify the client owns this workspace
    const { data: membership } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", clientUserId)
      .eq("role", "owner")
      .maybeSingle();

    if (!membership) throw new Error("You must be the workspace owner to disconnect an agency");

    // Find all active agency links for this workspace
    const { data: activeLinks } = await supabaseAdmin
      .from("agency_client_links")
      .select("id, agency_user_id, agency_client_id")
      .eq("workspace_id", workspace_id)
      .eq("client_user_id", clientUserId)
      .eq("status", "active");

    if (!activeLinks || activeLinks.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active agency connection found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    for (const link of activeLinks) {
      // 1. Update agency_client_links status
      await supabaseAdmin
        .from("agency_client_links")
        .update({ status: "disconnected", disconnected_at: now })
        .eq("id", link.id);

      // 2. Update agency_clients status
      if (link.agency_client_id) {
        await supabaseAdmin
          .from("agency_clients")
          .update({ status: "disconnected", disconnected_at: now, disconnected_by: "client" })
          .eq("id", link.agency_client_id);
      }

      // 3. Remove agency user from workspace_members
      await supabaseAdmin
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspace_id)
        .eq("user_id", link.agency_user_id);

      // 4. Log the activity
      await supabaseAdmin
        .from("agency_activity_log")
        .insert({
          action_type: "client_disconnected",
          action_label: "Client disconnected from agency",
          actor_user_id: clientUserId,
          agency_user_id: link.agency_user_id,
          workspace_id,
          details: { disconnected_by: "client" },
        });

      logStep("Agency disconnected", { linkId: link.id, agencyUserId: link.agency_user_id });
    }

    return new Response(JSON.stringify({ success: true, disconnected_count: activeLinks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
