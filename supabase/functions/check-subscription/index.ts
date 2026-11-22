import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Price ID → plan mapping (must match stripePlans.ts)
const PRICE_TO_PLAN: Record<string, { plan_key: string; billing_period: string }> = {
  "price_1UbSHmCe9zfY8LQSLOT809uc": { plan_key: "starter", billing_period: "monthly" },
  "price_1UbSHsCe9zfY8LQSArETUA7Z": { plan_key: "growth", billing_period: "monthly" },
  "price_1UbSHsCe9zfY8LQSYCtCblo4": { plan_key: "scale", billing_period: "monthly" },
  "price_1UbSHtCe9zfY8LQSvzw38Njm": { plan_key: "pro", billing_period: "monthly" },
  "price_1T9w3sE8YDONFUnR41GC6zK7": { plan_key: "starter", billing_period: "monthly" },
  "price_1T9w3uE8YDONFUnRPrlnIJvX": { plan_key: "growth", billing_period: "monthly" },
  "price_1TALm0E8YDONFUnROektjSnb": { plan_key: "scale", billing_period: "monthly" },
  "price_1TDyFWE8YDONFUnRRgkHPM7c": { plan_key: "pro", billing_period: "monthly" },






};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

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
    if (claimsError || !claimsData?.claims) {
      logStep("Auth unavailable");
      return new Response(JSON.stringify({ subscribed: false, plan_key: "free", auth_unavailable: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string;
    logStep("User authenticated", { userId, email });

    // Get workspace_id from body or profile
    let body: Record<string, string> = {};
    try { body = await req.json(); } catch { /* no body */ }
    let workspaceId = body?.workspace_id;

    if (!workspaceId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("workspace_id, primary_workspace_id")
        .eq("id", userId)
        .single();
      workspaceId = profile?.primary_workspace_id || profile?.workspace_id;
    }

    const access = await supabaseAdmin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
    if (access.error || !access.data) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!workspaceId) {
      logStep("No workspace found");
      return new Response(JSON.stringify({
        subscribed: false, plan_key: "free", billing_period: "monthly",
        subscription_status: "free", current_period_end: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check local DB first
    const { data: localSub } = await supabaseAdmin
      .from("workspace_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    // Check courtesy plan first — takes priority over Stripe
    if (localSub?.courtesy_plan_key) {
      const courtesyExpires = localSub.courtesy_plan_expires_at ? new Date(localSub.courtesy_plan_expires_at) : null;
      if (!courtesyExpires || courtesyExpires > new Date()) {
        logStep("Active courtesy plan detected", { plan: localSub.courtesy_plan_key, expires: localSub.courtesy_plan_expires_at });
        return new Response(JSON.stringify({
          subscribed: true,
          plan_key: localSub.courtesy_plan_key,
          billing_period: "courtesy",
          subscription_status: "active",
          current_period_end: localSub.courtesy_plan_expires_at,
          is_courtesy: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        logStep("Courtesy plan expired, clearing", { expired: localSub.courtesy_plan_expires_at });
        await supabaseAdmin
          .from("workspace_subscriptions")
          .update({ courtesy_plan_key: null, courtesy_plan_expires_at: null, updated_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId);
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (localSub?.stripe_subscription_id && ["active", "trialing"].includes(localSub.subscription_status ?? "")) {
      // Self-healing: verify price against Stripe and auto-update if different
      try {
        const stripeSub = await stripe.subscriptions.retrieve(localSub.stripe_subscription_id);
        const livePriceId = stripeSub.items.data[0]?.price?.id;
        const livePlanInfo = PRICE_TO_PLAN[livePriceId] || { plan_key: localSub.plan_key, billing_period: localSub.billing_period };

        if (stripeSub.cancel_at_period_end || (stripeSub.cancel_at && new Date(stripeSub.cancel_at * 1000) > new Date())) {
          logStep("Subscription cancelled at period end");
          await supabaseAdmin
            .from("workspace_subscriptions")
            .update({ subscription_status: "canceled", updated_at: new Date().toISOString() })
            .eq("workspace_id", workspaceId);

          return new Response(JSON.stringify({
            subscribed: true,
            plan_key: livePlanInfo.plan_key,
            billing_period: livePlanInfo.billing_period,
            subscription_status: "canceled",
            current_period_end: localSub.current_period_end,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Self-heal if price changed
        if (livePriceId && livePriceId !== localSub.stripe_price_id) {
          logStep("Self-healing: price mismatch detected", { local: localSub.stripe_price_id, live: livePriceId });
          await supabaseAdmin
            .from("workspace_subscriptions")
            .update({
              stripe_price_id: livePriceId,
              plan_key: livePlanInfo.plan_key,
              billing_period: livePlanInfo.billing_period,
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", workspaceId);
        }

        return new Response(JSON.stringify({
          subscribed: true,
          plan_key: livePlanInfo.plan_key,
          billing_period: livePlanInfo.billing_period,
          subscription_status: stripeSub.status === "active" ? "active" : stripeSub.status,
          current_period_end: localSub.current_period_end,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        logStep("Stripe verification failed, using local data", { error: String(e) });
      }

      return new Response(JSON.stringify({
        subscribed: true,
        plan_key: localSub.plan_key,
        billing_period: localSub.billing_period,
        subscription_status: localSub.subscription_status,
        current_period_end: localSub.current_period_end,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle past_due — treat as subscribed (grace period)
    if (localSub?.subscription_status === "past_due") {
      return new Response(JSON.stringify({
        subscribed: true,
        plan_key: localSub.plan_key,
        billing_period: localSub.billing_period,
        subscription_status: "past_due",
        current_period_end: localSub.current_period_end,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (localSub?.subscription_status === "canceled" && localSub.current_period_end && new Date(localSub.current_period_end) > new Date()) {
      return new Response(JSON.stringify({ subscribed: true, plan_key: localSub.plan_key, billing_period: localSub.billing_period, subscription_status: "canceled", current_period_end: localSub.current_period_end }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ subscribed: false, plan_key: "free", billing_period: "monthly", subscription_status: "free", current_period_end: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
