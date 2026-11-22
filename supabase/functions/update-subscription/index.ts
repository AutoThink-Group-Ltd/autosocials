import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { appendEvent, createRun, finalizeRun, makeSeqCounter } from "../_shared/agent/trace.ts";
import { immediateProrationAmount } from "./preview.ts";
import { proratedCreditIncrease } from "../credit-auto-upgrade/rules.ts";

const monthlyPlans = [
  { credits: 1000, amount: 4900, live: "price_1T9w3sE8YDONFUnR41GC6zK7", test: "price_1UbSHmCe9zfY8LQSLOT809uc" },
  { credits: 1800, amount: 7900, live: "price_1T9w3uE8YDONFUnRPrlnIJvX", test: "price_1UbSHsCe9zfY8LQSArETUA7Z" },
  { credits: 5000, amount: 19900, live: "price_1TALm0E8YDONFUnROektjSnb", test: "price_1UbSHsCe9zfY8LQSYCtCblo4" },
  { credits: 8000, amount: 29900, live: "price_1TDyFWE8YDONFUnRRgkHPM7c", test: "price_1UbSHtCe9zfY8LQSvzw38Njm" },
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[UPDATE-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let operationId: string | undefined;
  let stripeSubmitted = false;
  let operationAdmin: any;
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

    const { price_id, workspace_id, action, confirmed, confirmation_text, quote_id } = await req.json();

    // Agentic safety gate: billing mutations require explicit confirmation.
    if (action === "cancel") {
      if (confirmation_text !== "CANCEL") {
        return new Response(JSON.stringify({
          error: "confirmation_required",
          message: "billing.cancel_subscription requires explicit typed confirmation: pass confirmation_text:\"CANCEL\".",
        }), { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (action !== "preview") {
      if (confirmed !== true) {
        return new Response(JSON.stringify({
          error: "confirmation_required",
          message: "billing.change_plan requires user confirmation. Re-invoke with confirmed:true.",
        }), { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    operationAdmin = supabaseAdmin;

    // Open trace run (best-effort).
    const seq = makeSeqCounter();
    let runId: string | null = null;
    const toolName = action === "cancel" ? "billing.cancel_subscription" : "billing.change_plan";

    // Get workspace subscription
    let wsId = workspace_id;
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
    if (owner.error || !owner.data) throw new Error("Only a workspace owner can manage a subscription");
    if (action !== "cancel") {
      if (action !== "preview" && action !== "confirm") throw new Error("Unsupported billing action");
      const binding = await supabaseAdmin.from("workspace_subscriptions").select("stripe_subscription_id, stripe_customer_id, subscription_status").eq("workspace_id", wsId).maybeSingle();
      if (binding.error || !binding.data?.stripe_subscription_id || !binding.data.stripe_customer_id || binding.data.subscription_status !== "active") throw new Error("An active paid subscription is required");
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const subscription = await stripe.subscriptions.retrieve(binding.data.stripe_subscription_id);
      if (subscription.status !== "active" || subscription.cancel_at_period_end || subscription.schedule || subscription.pending_update || subscription.items.data.length !== 1 || subscription.customer !== binding.data.stripe_customer_id) throw new Error("Subscription requires review before changing plans");
      const item = subscription.items.data[0]!;
      const priceField = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_") ? "test" : "live";
      const currentIndex = monthlyPlans.findIndex((plan) => plan[priceField] === item.price.id);
      if (currentIndex < 0) throw new Error("Unsupported current subscription");
      if (action === "preview") {
        const targetIndex = monthlyPlans.findIndex((plan) => plan[priceField] === price_id);
        if (targetIndex < 0 || targetIndex === currentIndex) throw new Error("Choose a different monthly plan");
        const at = Math.floor(Date.now() / 1000);
        const downgrade = targetIndex < currentIndex;
        const preview = downgrade ? null : await stripe.invoices.createPreview({ subscription: subscription.id, subscription_details: { items: [{ id: item.id, price: price_id }], proration_date: at } });
        const amount = preview ? immediateProrationAmount(preview) : 0;
        const expires = new Date(Date.now() + 5 * 60_000).toISOString();
        const quote = await supabaseAdmin.from("content_credit_plan_quotes").insert({ workspace_id: wsId, user_id: userId, stripe_subscription_id: subscription.id, current_price_id: item.price.id, target_price_id: price_id, proration_at: at, amount_due: amount, currency: "gbp", period_start: item.current_period_start, period_end: item.current_period_end, expires_at: expires }).select("id").single();
        if (quote.error || !quote.data) throw new Error("Could not save plan quote");
        return new Response(JSON.stringify({ quote_id: quote.data.id, amount_due: amount, currency: "gbp", expires_at: expires, credit_delta: downgrade ? 0 : proratedCreditIncrease(monthlyPlans[currentIndex]!.credits, monthlyPlans[targetIndex]!.credits, item.current_period_start, item.current_period_end, at), effective_at: new Date((downgrade ? item.current_period_end : at) * 1000).toISOString(), change: downgrade ? "downgrade" : "upgrade", next_monthly_price: monthlyPlans[targetIndex]!.amount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (Deno.env.get("CONTENT_CREDIT_AUTO_UPGRADE_READY") === "false") throw new Error("Plan changes are not available yet");
      if (typeof quote_id !== "string") throw new Error("A plan quote is required");
      const quoteResult = await supabaseAdmin.from("content_credit_plan_quotes").select("*").eq("id", quote_id).eq("workspace_id", wsId).eq("user_id", userId).maybeSingle();
      const quote = quoteResult.data;
      if (quoteResult.error || !quote || quote.status !== "open" || new Date(quote.expires_at) <= new Date() || quote.stripe_subscription_id !== subscription.id || quote.current_price_id !== item.price.id || quote.period_start !== item.current_period_start || quote.period_end !== item.current_period_end) throw new Error("Plan quote expired or subscription changed");
      const targetIndex = monthlyPlans.findIndex((plan) => plan[priceField] === quote.target_price_id);
      if (targetIndex < 0 || targetIndex === currentIndex) throw new Error("Invalid plan quote");
      const operation = await supabaseAdmin.rpc("claim_content_credit_billing_operation", { _workspace_id: wsId, _operation_key: `manual:${quote.id}`, _kind: "upgrade" });
      if (operation.error || !operation.data?.id || operation.data.reused) throw new Error("Another billing operation is pending");
      operationId = operation.data.id;
      if (targetIndex > currentIndex) {
        const preview = await stripe.invoices.createPreview({ subscription: subscription.id, subscription_details: { items: [{ id: item.id, price: quote.target_price_id }], proration_date: quote.proration_at } });
        if (immediateProrationAmount(preview) !== quote.amount_due) throw new Error("Quote changed; request a new preview");
      }
      const consumed = await supabaseAdmin.from("content_credit_plan_quotes").update({ status: "consumed" }).eq("id", quote.id).eq("status", "open").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (consumed.error || !consumed.data) throw new Error("Plan quote already used or expired");
      if (targetIndex < currentIndex) {
        const detail = subscription as unknown as { discounts?: unknown[]; default_tax_rates?: unknown[]; automatic_tax?: { enabled?: boolean } };
        if (quote.amount_due !== 0 || item.quantity !== 1 || detail.discounts?.length || detail.default_tax_rates?.length || detail.automatic_tax?.enabled) throw new Error("Downgrade requires manual billing review");
        stripeSubmitted = true;
        const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subscription.id }, { idempotencyKey: `downgrade-create:${quote.id}` });
        const scheduleStored = await supabaseAdmin.from("content_credit_billing_operations").update({ external_id: schedule.id }).eq("id", operationId).eq("status", "open");
        if (scheduleStored.error || !schedule.current_phase || schedule.current_phase.end_date !== item.current_period_end) throw new Error("Downgrade schedule needs reconciliation");
        const updated = await stripe.subscriptionSchedules.update(schedule.id, { end_behavior: "release", proration_behavior: "none", phases: [{ start_date: schedule.current_phase.start_date, end_date: item.current_period_end, items: [{ price: item.price.id, quantity: 1 }] }, { start_date: item.current_period_end, duration: { interval: "month", interval_count: 1 }, proration_behavior: "none", items: [{ price: quote.target_price_id, quantity: 1 }] }] }, { idempotencyKey: `downgrade-configure:${quote.id}` });
        if (updated.status !== "active" || updated.phases.length < 2) throw new Error("Downgrade schedule needs reconciliation");
        const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: operationId, _status: "completed", _external_id: schedule.id });
        if (resolved.error) throw new Error("Downgrade schedule needs reconciliation");
        operationId = undefined;
        return new Response(JSON.stringify({ status: "scheduled", effective_at: new Date(item.current_period_end * 1000).toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      stripeSubmitted = true; // An interrupted internal request can hide a submitted Stripe operation.
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) throw new Error("Billing service is unavailable");
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/credit-auto-upgrade`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: wsId, request_key: `manual:${quote.id}`, required_credits: 1, mode: "manual", target_price: quote.target_price_id, quote_id: quote.id, operation_id: operationId }) });
      const result = await response.json().catch(() => ({ error: "Plan change requires review" }));
      if (!response.ok) throw new Error("Plan change requires review");
      operationId = undefined; // The signed invoice webhook resolves the operation.
      return new Response(JSON.stringify(result), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: subRecord } = await supabaseAdmin
      .from("workspace_subscriptions")
      .select("stripe_subscription_id")
      .eq("workspace_id", wsId)
      .single();

    if (!subRecord?.stripe_subscription_id) {
      throw new Error("No active subscription found");
    }

    if (wsId) {
      try {
        runId = await createRun({
          workspaceId: wsId,
          userId,
          agentId: "vibe",
          workflowId: toolName,
          request: { action, price_id },
          initialState: "running",
        });
        await appendEvent({
          runId,
          workspaceId: wsId,
          seq: seq(),
          kind: "confirmation_granted",
          name: toolName,
        });
      } catch (e) {
        console.warn("[UPDATE-SUBSCRIPTION] trace open failed (non-fatal):", e);
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Handle cancellation
    if (action === "cancel") {
      const operation = await supabaseAdmin.rpc("claim_content_credit_billing_operation", { _workspace_id: wsId, _operation_key: `cancel:${crypto.randomUUID()}`, _kind: "upgrade" });
      if (operation.error || !operation.data?.id || operation.data.reused) throw new Error("Another billing operation is pending");
      operationId = operation.data.id;
      stripeSubmitted = true;
      const updated = await stripe.subscriptions.update(subRecord.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: operationId, _status: "completed" });
      if (resolved.error) throw new Error("Cancellation requires reconciliation");
      operationId = undefined;
      logStep("Subscription set to cancel at period end", { subscriptionId: updated.id });

      if (runId && wsId) {
        await appendEvent({ runId, workspaceId: wsId, seq: seq(), kind: "tool_result", name: toolName, ok: true, outputs: { cancel_at_period_end: true } });
        await finalizeRun({ runId, state: "complete", response: { cancel_at_period_end: true } });
      }
      return new Response(JSON.stringify({ success: true, cancel_at_period_end: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unsupported billing action");
  } catch (error) {
    if (operationId && operationAdmin) await operationAdmin.rpc("resolve_content_credit_billing_operation", { _id: operationId, _status: stripeSubmitted ? "reconciliation_required" : "failed" });
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
