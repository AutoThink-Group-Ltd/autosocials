import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[CUSTOMER-PORTAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");

    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let body: { workspace_id?: string; flow_data?: { type?: string } } = {};
    try { body = await req.json(); } catch { /* no body */ }

    let wsId = body?.workspace_id;
    if (!wsId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("workspace_id, primary_workspace_id")
        .eq("id", userId)
        .single();
      wsId = profile?.primary_workspace_id || profile?.workspace_id;
    }

    if (!wsId) throw new Error("Workspace required");
    const owner = await supabaseAdmin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: wsId });
    if (owner.error || !owner.data) throw new Error("Only a workspace owner can manage billing");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Try to find customer by workspace subscription first
    let customerId: string | undefined;
    if (wsId) {
      const { data: subRecord } = await supabaseAdmin
        .from("workspace_subscriptions")
        .select("stripe_customer_id")
        .eq("workspace_id", wsId)
        .single();
      customerId = subRecord?.stripe_customer_id ?? undefined;
    }

    if (!customerId) throw new Error("No Stripe customer found");

    const isLiveKey = stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_");
    const configurationId = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID") || (isLiveKey ? "bpc_1UbTDyE8YDONFUnRM6VF7Vpw" : undefined);
    if (!configurationId) throw new Error("Billing portal is not configured");
    const configuration = await stripe.billingPortal.configurations.retrieve(configurationId);
    if (!configuration.active || configuration.features.subscription_update.enabled || configuration.features.subscription_cancel.enabled) throw new Error("Billing portal configuration requires review");
    const origin = Deno.env.get("SITE_URL") || "https://autosocials.com";
    const portalOptions: any = {
      customer: customerId,
      configuration: configurationId,
      return_url: `${origin}/app/billing`,
    };

    // Support flow_data for payment method update
    if (body?.flow_data?.type === "payment_method_update") {
      portalOptions.flow_data = { type: "payment_method_update" };
    }

    const portalSession = await stripe.billingPortal.sessions.create(portalOptions);

    logStep("Portal session created");

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
