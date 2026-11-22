import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { initialUpgradePaymentSettings, mayReplaceSubscription, proratedCreditIncrease } from "./rules.ts";

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const plans = [
  { key: "starter", allowance: 1000, live: "price_1T9w3sE8YDONFUnR41GC6zK7", test: "price_1UbSHmCe9zfY8LQSLOT809uc" },
  { key: "growth", allowance: 1800, live: "price_1T9w3uE8YDONFUnRPrlnIJvX", test: "price_1UbSHsCe9zfY8LQSArETUA7Z" },
  { key: "scale", allowance: 5000, live: "price_1TALm0E8YDONFUnROektjSnb", test: "price_1UbSHsCe9zfY8LQSYCtCblo4" },
  { key: "pro", allowance: 8000, live: "price_1TDyFWE8YDONFUnRRgkHPM7c", test: "price_1UbSHtCe9zfY8LQSvzw38Njm" },
] as const;

// Internal worker endpoint: never accept a browser-provided authorization to charge.
serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json(403, { error: "Forbidden" });
  if (Deno.env.get("CONTENT_CREDIT_AUTO_UPGRADE_READY") === "false") return json(503, { error: "Automatic upgrades unavailable" });
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json(503, { error: "Billing unavailable" });
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, { auth: { persistSession: false } });
  let claimId: string | undefined;
  let operationId: string | undefined;
  let submitted = false;
  try {
    const input = await req.json();
    if (typeof input.workspace_id !== "string" || typeof input.request_key !== "string" || input.request_key.length < 1 || input.request_key.length > 100 || !Number.isSafeInteger(input.required_credits) || input.required_credits < 1) return json(400, { error: "Invalid upgrade request" });
    const manual = input.mode === "manual";
    if (manual && (typeof input.target_price !== "string" || typeof input.quote_id !== "string" || typeof input.operation_id !== "string")) return json(400, { error: "Invalid target plan" });
    const preference = await db.from("content_credit_preferences").select("automatic_upgrade").eq("workspace_id", input.workspace_id).maybeSingle();
    if (preference.error || (!manual && !preference.data?.automatic_upgrade)) return json(409, { error: "Automatic upgrade is disabled" });
    const now = new Date().toISOString();
    const periodResult = await db.from("content_credit_periods").select("id,granted,starts_at,ends_at").eq("workspace_id", input.workspace_id).lte("starts_at", now).gt("ends_at", now).maybeSingle();
    if (periodResult.error || !periodResult.data) return json(409, { error: "No active credit period" });
    const period = periodResult.data;
    const rows = await db.from("content_credit_reservations").select("credits,state").eq("period_id", period.id);
    if (rows.error) throw rows.error;
    const used = (rows.data ?? []).filter((row) => row.state !== "released").reduce((sum, row) => sum + row.credits, 0);
    if (!manual && period.granted - used >= input.required_credits) return json(409, { error: "Sufficient credits remain" });
    const binding = await db.from("workspace_subscriptions").select("stripe_subscription_id,stripe_customer_id,plan_key,subscription_status").eq("workspace_id", input.workspace_id).maybeSingle();
    if (binding.error) throw binding.error;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const priceField = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_") ? "test" : "live";
    let mayCreatePaidSubscription = !binding.data?.stripe_subscription_id;
    if (binding.data?.stripe_subscription_id && ["canceled", "incomplete_expired"].includes(binding.data.subscription_status ?? "")) {
      const previous = await stripe.subscriptions.retrieve(binding.data.stripe_subscription_id);
      const previousCustomer = typeof previous.customer === "string" ? previous.customer : previous.customer.id;
      if (!mayReplaceSubscription(previous.status, previousCustomer, binding.data.stripe_customer_id)) return json(409, { error: "Previous subscription requires reconciliation" });
      mayCreatePaidSubscription = true;
    }
    if (mayCreatePaidSubscription) {
      if (manual) return json(409, { error: "Choose a paid subscription through checkout" });
      const payment = await db.from("credit_payment_customers").select("stripe_customer_id,payment_method_id,status").eq("workspace_id", input.workspace_id).maybeSingle();
      if (payment.error || payment.data?.status !== "ready" || !payment.data.payment_method_id) return json(409, { error: "Set up a payment method before upgrading" });
      if (binding.data?.stripe_customer_id && binding.data.stripe_customer_id !== payment.data.stripe_customer_id) return json(409, { error: "Customer binding requires reconciliation" });
      const start = Math.floor(Date.parse(period.starts_at) / 1000); const end = Math.floor(Date.parse(period.ends_at) / 1000); const at = Math.floor(Date.now() / 1000);
      const delta = proratedCreditIncrease(400, 1000, start, end, at);
      if (delta < 1) return json(409, { error: "Upgrade would not add credits in this period" });
      const source = `credit-upgrade:${input.workspace_id}:${period.id}:free:${input.request_key}`;
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      const requestKey = `credit-upgrade:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const operation = await db.rpc("claim_content_credit_billing_operation", { _workspace_id: input.workspace_id, _operation_key: requestKey, _kind: "upgrade" });
      if (operation.error || !operation.data?.id || operation.data.reused) return json(409, { error: "Another billing operation is pending or needs review" });
      operationId = operation.data.id;
      const inserted = await db.from("content_credit_upgrades").insert({ workspace_id: input.workspace_id, period_id: period.id, idempotency_key: requestKey, stripe_request_key: requestKey, stripe_price_id: plans[0][priceField], proration_at: at, from_plan: "free", to_plan: "starter", delta_credits: delta, status: "pending" }).select("id").single();
      if (inserted.error || !inserted.data) throw new Error("Could not create upgrade claim");
      claimId = inserted.data.id;
      submitted = true;
      const created = await stripe.subscriptions.create({ customer: payment.data.stripe_customer_id, default_payment_method: payment.data.payment_method_id, items: [{ price: plans[0][priceField] }], billing_cycle_anchor: end, proration_behavior: "create_prorations", ...initialUpgradePaymentSettings, metadata: { credit_upgrade_claim_id: claimId, workspace_id: input.workspace_id }, expand: ["latest_invoice"] }, { idempotencyKey: requestKey });
      const invoiceId = typeof created.latest_invoice === "string" ? created.latest_invoice : created.latest_invoice?.id;
      if (!invoiceId) throw new Error("Upgrade invoice missing");
      const operationSaved = await db.from("content_credit_billing_operations").update({ external_id: invoiceId }).eq("id", operationId).eq("status", "open");
      if (operationSaved.error) throw operationSaved.error;
      const saved = await db.from("content_credit_upgrades").update({ stripe_subscription_id: created.id, stripe_invoice_id: invoiceId, status: "payment_pending", updated_at: new Date().toISOString() }).eq("id", claimId).eq("status", "pending");
      if (saved.error) throw saved.error;
      return json(202, { status: "payment_pending", upgrade_id: claimId });
    }
    if (!binding.data?.stripe_subscription_id || binding.data.subscription_status !== "active") return json(409, { error: "An active paid subscription is required" });
    const subscription = await stripe.subscriptions.retrieve(binding.data.stripe_subscription_id);
    if (subscription.status !== "active" || subscription.cancel_at_period_end || subscription.schedule || subscription.pending_update || subscription.items.data.length !== 1) return json(409, { error: "Subscription cannot be upgraded automatically while another change is scheduled" });
    const index = plans.findIndex((plan) => plan[priceField] === subscription.items.data[0]?.price.id);
    if (index < 0 || index === plans.length - 1) return json(409, { error: "No higher eligible plan" });
    const targetIndex = manual ? plans.findIndex((plan) => plan[priceField] === input.target_price) : index + 1;
    if (targetIndex <= index) return json(409, { error: "Choose a higher monthly plan" });
    const current = plans[index]!; const next = plans[targetIndex]!;
    let quote: { proration_at: number; current_price_id: string; target_price_id: string; stripe_subscription_id: string; period_start: number; period_end: number; expires_at: string; status: string } | null = null;
    if (manual) {
      const checked = await db.from("content_credit_plan_quotes").select("proration_at,current_price_id,target_price_id,stripe_subscription_id,period_start,period_end,expires_at,status").eq("id", input.quote_id).eq("workspace_id", input.workspace_id).maybeSingle();
      if (checked.error || !checked.data || checked.data.status !== "consumed" || new Date(checked.data.expires_at) <= new Date()) return json(409, { error: "Plan quote expired" });
      quote = checked.data;
      if (quote.stripe_subscription_id !== subscription.id || quote.current_price_id !== subscription.items.data[0]?.price.id || quote.target_price_id !== input.target_price) return json(409, { error: "Subscription changed; request a new quote" });
      const op = await db.from("content_credit_billing_operations").select("id,status,kind,operation_key").eq("id", input.operation_id).eq("workspace_id", input.workspace_id).maybeSingle();
      if (op.error || !op.data || op.data.status !== "open" || op.data.kind !== "upgrade" || op.data.operation_key !== `manual:${input.quote_id}`) return json(409, { error: "Plan change operation is invalid" });
      operationId = op.data.id;
    }
    const prorationAt = quote?.proration_at ?? Math.floor(Date.now() / 1000);
    const start = subscription.items.data[0]!.current_period_start; const end = subscription.items.data[0]!.current_period_end;
    if (quote && (quote.period_start !== start || quote.period_end !== end)) return json(409, { error: "Subscription changed; request a new quote" });
    // A paid subscription created mid-way through the free period shares its
    // end date, while its Stripe start can be later than the ledger start.
    if (Date.parse(period.starts_at) > start * 1000 || Date.parse(period.ends_at) !== end * 1000 || prorationAt >= end || prorationAt < start) return json(409, { error: "Billing period requires reconciliation" });
    const delta = proratedCreditIncrease(current.allowance, next.allowance, start, end, prorationAt);
    if (delta < 1) return json(409, { error: "Upgrade would not add credits in this period" });
    const source = `credit-upgrade:${input.workspace_id}:${period.id}:${current.key}:${input.request_key}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const requestKey = quote ? `manual:${input.quote_id}` : `credit-upgrade:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    if (!quote) {
      const operation = await db.rpc("claim_content_credit_billing_operation", { _workspace_id: input.workspace_id, _operation_key: requestKey, _kind: "upgrade" });
      if (operation.error || !operation.data?.id || operation.data.reused) return json(409, { error: "Another billing operation is pending or needs review" });
      operationId = operation.data.id;
    }
    const inserted = await db.from("content_credit_upgrades").insert({ workspace_id: input.workspace_id, period_id: period.id, idempotency_key: requestKey, stripe_request_key: requestKey, stripe_subscription_id: subscription.id, stripe_price_id: next[priceField], proration_at: prorationAt, from_plan: current.key, to_plan: next.key, delta_credits: delta, status: "pending" }).select("id").single();
    if (inserted.error || !inserted.data) throw new Error("Could not create upgrade claim");
    claimId = inserted.data.id;
    submitted = true;
    const updated = await stripe.subscriptions.update(subscription.id, { items: [{ id: subscription.items.data[0]!.id, price: next[priceField] }], payment_behavior: "pending_if_incomplete", proration_behavior: "always_invoice", proration_date: prorationAt, expand: ["latest_invoice"] }, { idempotencyKey: requestKey });
    const invoiceId = typeof updated.latest_invoice === "string" ? updated.latest_invoice : updated.latest_invoice?.id;
    if (!invoiceId) throw new Error("Upgrade invoice missing");
    const operationSaved = await db.from("content_credit_billing_operations").update({ external_id: invoiceId }).eq("id", operationId).eq("status", "open");
    if (operationSaved.error) throw operationSaved.error;
    const saved = await db.from("content_credit_upgrades").update({ stripe_invoice_id: invoiceId, status: "payment_pending", updated_at: new Date().toISOString() }).eq("id", claimId).eq("status", "pending");
    if (saved.error) throw saved.error;
    return json(202, { status: "payment_pending", upgrade_id: claimId });
  } catch {
    if (claimId) await db.from("content_credit_upgrades").update({ status: submitted ? "reconciliation_required" : "failed", updated_at: new Date().toISOString() }).eq("id", claimId).eq("status", "pending");
    if (operationId) await db.rpc("resolve_content_credit_billing_operation", { _id: operationId, _status: submitted ? "reconciliation_required" : "failed" });
    return json(503, { error: "Upgrade needs review before retrying" });
  }
});
