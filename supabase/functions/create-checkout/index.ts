import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let billingOperationId: string | undefined;
  let stripeSubmitted = false;
  let billingAdmin: any;
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
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");

    const userId = claimsData.claims.sub as string;
    const email = claimsData.claims.email as string;
    if (!email) throw new Error("Email not available");

    logStep("User authenticated", { userId, email });

    const { price_id, workspace_id } = await req.json();
    const allowedPrices = new Set([
      "price_1T9w3sE8YDONFUnR41GC6zK7", "price_1T9w3uE8YDONFUnRPrlnIJvX",
      "price_1TALm0E8YDONFUnROektjSnb", "price_1TDyFWE8YDONFUnRRgkHPM7c",
      "price_1UbSHmCe9zfY8LQSLOT809uc", "price_1UbSHsCe9zfY8LQSArETUA7Z",
      "price_1UbSHsCe9zfY8LQSYCtCblo4", "price_1UbSHtCe9zfY8LQSvzw38Njm",
    ]);
    if (typeof price_id !== "string" || !allowedPrices.has(price_id)) throw new Error("Unsupported price");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    billingAdmin = admin;
    let workspaceId: string | undefined = typeof workspace_id === "string" ? workspace_id : undefined;
    if (!workspaceId) {
      const { data: profile, error } = await admin.from("profiles").select("primary_workspace_id, workspace_id").eq("id", userId).single();
      if (error) throw new Error("Could not identify workspace");
      workspaceId = profile?.primary_workspace_id ?? profile?.workspace_id ?? undefined;
    }
    if (!workspaceId) throw new Error("Create a workspace before subscribing");
    const owner = await admin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId });
    if (owner.error || !owner.data) throw new Error("Only a workspace owner can manage its subscription");
    const stored = await admin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle();
    if (stored.error) throw new Error("Could not verify workspace billing");
    const setupBinding = await admin.from("credit_payment_customers").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle();
    if (setupBinding.error) throw new Error("Could not verify payment setup");
    if (stored.data?.stripe_customer_id && setupBinding.data?.stripe_customer_id && stored.data.stripe_customer_id !== setupBinding.data.stripe_customer_id) throw new Error("Workspace billing needs reconciliation");
    const customerId: string | undefined = stored.data?.stripe_customer_id ?? setupBinding.data?.stripe_customer_id ?? undefined;

    if (customerId) {
      logStep("Found existing customer", { customerId });

      // Check for active subscription
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      if (subs.has_more || subs.data.some((item: { status: string }) => !["canceled", "incomplete_expired"].includes(item.status))) {
        throw new Error("You already have an active subscription. Use the customer portal to manage it.");
      }
    }

    const origin = Deno.env.get("SITE_URL") || "https://autosocials.com";

    const operation = await admin.rpc("claim_content_credit_billing_operation", { _workspace_id: workspaceId, _operation_key: `checkout:${crypto.randomUUID()}`, _kind: "checkout" });
    if (operation.error || !operation.data?.id || operation.data.reused) throw new Error("Another billing operation is pending");
    billingOperationId = operation.data.id;

    stripeSubmitted = true;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      line_items: [{ price: price_id, quantity: 1 }],
      mode: "subscription",
      payment_method_collection: "always",
      metadata: { user_id: userId, workspace_id: workspaceId, billing_operation_id: billingOperationId },
      success_url: `${origin}/app?welcome=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
    });
    const savedOperation = await admin.from("content_credit_billing_operations").update({ external_id: session.id }).eq("id", billingOperationId).eq("status", "open");
    if (savedOperation.error) throw new Error("Could not record checkout session");

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    if (billingOperationId && billingAdmin) await billingAdmin.rpc("resolve_content_credit_billing_operation", { _id: billingOperationId, _status: stripeSubmitted ? "reconciliation_required" : "failed" });
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
