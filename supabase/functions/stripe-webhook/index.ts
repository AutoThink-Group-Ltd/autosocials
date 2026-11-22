import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { invoiceSubscriptionId as invoiceSubscription, invoiceLinePriceId as invoiceLinePrice, invoiceLineIsProration as invoiceLineProration } from "./stripe-payload.ts";
import { mayReplaceSubscription } from "../credit-auto-upgrade/rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const PRICE_TO_PLAN: Record<string, { plan_key: string; billing_period: string }> = {
  // AutoSocials sandbox monthly credit subscriptions.
  "price_1UbSHmCe9zfY8LQSLOT809uc": { plan_key: "starter", billing_period: "monthly" },
  "price_1UbSHsCe9zfY8LQSArETUA7Z": { plan_key: "growth", billing_period: "monthly" },
  "price_1UbSHsCe9zfY8LQSYCtCblo4": { plan_key: "scale", billing_period: "monthly" },
  "price_1UbSHtCe9zfY8LQSvzw38Njm": { plan_key: "pro", billing_period: "monthly" },
  "price_1T9w3sE8YDONFUnR41GC6zK7": { plan_key: "starter", billing_period: "monthly" },
  "price_1T9w3uE8YDONFUnRPrlnIJvX": { plan_key: "growth", billing_period: "monthly" },
  "price_1TALm0E8YDONFUnROektjSnb": { plan_key: "scale", billing_period: "monthly" },
  "price_1TDyFWE8YDONFUnRRgkHPM7c": { plan_key: "pro", billing_period: "monthly" },






};


// Helper: resolve agency for a workspace and create/update commission
async function handleCommissionForInvoice(
  supabaseAdmin: any,
  workspaceId: string,
  invoice: any,
  planInfo: { plan_key: string; billing_period: string },
  subscriptionStatus: string,
  trialEnd?: number | null
) {
  try {
    // Find agency_client_link for this workspace
    const { data: links } = await supabaseAdmin
      .from("agency_client_links")
      .select("agency_user_id, agency_client_id, workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    if (!links || links.length === 0) {
      logStep("No agency link for workspace, skipping commission");
      return;
    }

    for (const link of links) {
      // Check if this is a referred client (not managed-only) via invitation
      const { data: invitation } = await supabaseAdmin
        .from("agency_client_invitations")
        .select("invitation_type")
        .eq("agency_user_id", link.agency_user_id)
        .eq("workspace_id", workspaceId)
        .in("status", ["accepted", "pending"])
        .maybeSingle();

      const invitationType = invitation?.invitation_type || "managed";
      if (invitationType !== "referral") {
        logStep("Managed-only client, no commission", { workspaceId });
        continue;
      }

      const invoiceId = invoice.id;
      const commissionRate = 0.20; // 20% recurring
      const invoiceAmount = (invoice.amount_paid || 0) / 100;
      const commissionAmount = Math.round(invoiceAmount * commissionRate * 100) / 100;

      // Idempotency: check if commission already exists for this invoice
      const { data: existing } = await supabaseAdmin
        .from("agency_commissions")
        .select("id")
        .eq("stripe_invoice_id", invoiceId)
        .eq("agency_user_id", link.agency_user_id)
        .maybeSingle();

      if (existing) {
        logStep("Commission already exists, skipping", { invoiceId });
        continue;
      }

      // Find client_user_id from the link
      const { data: clientLink } = await supabaseAdmin
        .from("agency_client_links")
        .select("client_user_id")
        .eq("id", link.agency_user_id === link.agency_user_id ? undefined : "")
        .maybeSingle();

      // Get client_user_id from agency_client_links
      const { data: fullLink } = await supabaseAdmin
        .from("agency_client_links")
        .select("client_user_id")
        .eq("workspace_id", workspaceId)
        .eq("agency_user_id", link.agency_user_id)
        .eq("status", "active")
        .maybeSingle();

      await supabaseAdmin
        .from("agency_commissions")
        .insert({
          agency_user_id: link.agency_user_id,
          client_user_id: fullLink?.client_user_id || "00000000-0000-0000-0000-000000000000",
          workspace_id: workspaceId,
          agency_client_id: link.agency_client_id,
          invoice_amount: invoiceAmount,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          currency: invoice.currency || "gbp",
          status: subscriptionStatus === "trialing" ? "upcoming" : "pending",
          stripe_invoice_id: invoiceId,
          stripe_charge_id: invoice.charge || null,
          billing_period: planInfo.billing_period,
          plan_key: planInfo.plan_key,
          subscription_status: subscriptionStatus,
          trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
          invoice_date: new Date((invoice.created || Date.now() / 1000) * 1000).toISOString(),
        });

      logStep("Commission created", { agencyUserId: link.agency_user_id, amount: commissionAmount, invoiceId });
    }
  } catch (err) {
    logStep("Commission handling error (non-fatal)", { error: String(err) });
  }
}

// Helper: void commissions for a workspace when subscription is canceled/deleted
async function voidCommissionsForWorkspace(supabaseAdmin: any, workspaceId: string) {
  try {
    const { data: pendingCommissions } = await supabaseAdmin
      .from("agency_commissions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("status", ["upcoming", "pending"]);

    if (pendingCommissions && pendingCommissions.length > 0) {
      const ids = pendingCommissions.map((c: any) => c.id);
      await supabaseAdmin
        .from("agency_commissions")
        .update({ status: "voided", updated_at: new Date().toISOString() })
        .in("id", ids);

      logStep("Voided commissions for canceled subscription", { workspaceId, count: ids.length });
    }
  } catch (err) {
    logStep("Commission voiding error (non-fatal)", { error: String(err) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    if (!sig) return new Response("Missing Stripe signature", { status: 400 });
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch {
      return new Response("Invalid Stripe signature", { status: 400 });
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "ping": {
        // A signed configuration check verifies the runtime Stripe key can read
        // the intended account's Starter price without charging a customer.
        const starter = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_")
          ? "price_1UbSHmCe9zfY8LQSLOT809uc"
          : "price_1T9w3sE8YDONFUnR41GC6zK7";
        const price = await stripe.prices.retrieve(starter);
        if (!price.active || price.currency !== "gbp" || price.unit_amount !== 4900 || price.recurring?.interval !== "month") throw new Error("Stripe Starter price configuration mismatch");
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "setup" && session.metadata?.purpose === "credit_auto_upgrade") {
          const workspaceId = session.metadata.workspace_id;
          const userId = session.metadata.user_id;
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          const intentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
          if (!workspaceId || !userId || !customerId || !intentId) throw new Error("Setup checkout missing identity");
          const owner = await supabaseAdmin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId });
          if (owner.error || !owner.data) throw new Error("Setup checkout owner no longer has access");
          const binding = await supabaseAdmin.from("credit_payment_customers").select("stripe_customer_id,setup_checkout_session_id").eq("workspace_id", workspaceId).maybeSingle();
          if (binding.error || !binding.data || binding.data.stripe_customer_id !== customerId || binding.data.setup_checkout_session_id !== session.id) throw new Error("Setup checkout binding mismatch");
          const intent = await stripe.setupIntents.retrieve(intentId);
          const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
          const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
          if (intent.status !== "succeeded" || intentCustomer !== customerId || !paymentMethodId) throw new Error("Setup intent not verified");
          const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
          const methodCustomer = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;
          if (methodCustomer !== customerId) throw new Error("Payment method customer mismatch");
          await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
          const saved = await supabaseAdmin.from("credit_payment_customers").update({ setup_intent_id: intentId, payment_method_id: paymentMethodId, status: "ready", updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("stripe_customer_id", customerId).eq("setup_checkout_session_id", session.id);
          if (saved.error) throw new Error("Could not save payment method binding");
          break;
        }
        const userId = session.metadata?.user_id;
        if (!userId) { logStep("No user_id in metadata"); break; }

        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const planInfo = priceId ? PRICE_TO_PLAN[priceId] : undefined;
        if (!planInfo) throw new Error("Unrecognized subscription price");

        logStep("Checkout completed", { userId, planInfo, subscriptionId });

        const workspaceId = session.metadata?.workspace_id;
        if (!workspaceId) throw new Error("Checkout has no workspace binding");
        const owner = await supabaseAdmin.rpc("is_workspace_owner", { _user_id: userId, _workspace_id: workspaceId });
        if (owner.error || !owner.data) throw new Error("Checkout owner no longer has workspace access");

        if (workspaceId) {
          const binding = await supabaseAdmin
            .from("workspace_subscriptions")
            .upsert({
              workspace_id: workspaceId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              stripe_price_id: priceId,
              plan_key: planInfo.plan_key,
              billing_period: planInfo.billing_period,
              currency: "gbp",
              subscription_status: subscription.status,
              current_period_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "workspace_id" });
          if (binding.error) throw new Error("Could not bind subscription to workspace");

          logStep("Subscription record upserted", { workspaceId });
        }
        if (session.metadata?.billing_operation_id) {
          const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: session.metadata.billing_operation_id, _status: "completed", _external_id: session.id });
          if (resolved.error) throw new Error("Checkout operation could not be resolved");
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.billing_operation_id) {
          const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: session.metadata.billing_operation_id, _status: "expired", _external_id: session.id });
          if (resolved.error) throw new Error("Expired checkout operation could not be resolved");
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const planInfo = priceId ? PRICE_TO_PLAN[priceId] : undefined;
        if (!planInfo) throw new Error("Unrecognized subscription price");

        let status = subscription.status;
        if (subscription.cancel_at_period_end) status = "canceled";

        const { data: subRecord } = await supabaseAdmin
          .from("workspace_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", customerId)
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (subRecord) {
          await supabaseAdmin
            .from("workspace_subscriptions")
            .update({
              stripe_price_id: priceId,
              plan_key: planInfo.plan_key,
              billing_period: planInfo.billing_period,
              subscription_status: status,
              current_period_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", subRecord.workspace_id);

          logStep("Subscription updated", { workspaceId: subRecord.workspace_id, plan: planInfo.plan_key, status });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: subRecord } = await supabaseAdmin
          .from("workspace_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", customerId)
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (subRecord) {
          await supabaseAdmin
            .from("workspace_subscriptions")
            .update({
              subscription_status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", subRecord.workspace_id);

          logStep("Subscription deleted/canceled", { workspaceId: subRecord.workspace_id });

          // Void any pending/upcoming commissions
          await voidCommissionsForWorkspace(supabaseAdmin, subRecord.workspace_id);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscriptionId = invoiceSubscription(invoice);

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const { data: subRecord } = await supabaseAdmin
            .from("workspace_subscriptions")
            .select("workspace_id")
            .eq("stripe_customer_id", customerId)
            .eq("stripe_subscription_id", subscriptionId)
            .single();

          if (subRecord) {
            await supabaseAdmin
              .from("workspace_subscriptions")
              .update({
                current_period_start: new Date(subscription.items.data[0].current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
                subscription_status: subscription.status,
                updated_at: new Date().toISOString(),
              })
              .eq("workspace_id", subRecord.workspace_id);

            logStep("Invoice payment succeeded, periods updated", { workspaceId: subRecord.workspace_id });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const failedCustomerId = invoice.customer as string;
        logStep("Invoice payment failed", { invoiceId: invoice.id, customer: failedCustomerId });

        const { data: failedSubRecord } = await supabaseAdmin
          .from("workspace_subscriptions")
          .select("workspace_id")
          .eq("stripe_customer_id", failedCustomerId)
          .eq("stripe_subscription_id", invoiceSubscription(invoice) ?? "")
          .single();

        if (failedSubRecord) {
          await supabaseAdmin
            .from("workspace_subscriptions")
            .update({
              subscription_status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", failedSubRecord.workspace_id);

          logStep("Subscription set to past_due", { workspaceId: failedSubRecord.workspace_id });
        }
        break;
      }

      case "invoice.paid": {
        const paidInvoice = event.data.object as Stripe.Invoice;
        if (paidInvoice.status !== "paid") throw new Error("Invoice payment is not confirmed");
        const paidCustomerId = paidInvoice.customer as string;
        const paidSubscriptionId = invoiceSubscription(paidInvoice);

        logStep("Invoice paid", { invoiceId: paidInvoice.id, customer: paidCustomerId });

        if (paidSubscriptionId) {
          const paidSubscription = await stripe.subscriptions.retrieve(paidSubscriptionId);
          const freeClaimId = paidSubscription.metadata?.credit_upgrade_claim_id;
          const freeWorkspaceId = paidSubscription.metadata?.workspace_id;
          if (freeClaimId && freeWorkspaceId && paidInvoice.billing_reason === "subscription_create") {
            if (paidInvoice.status !== "paid" || paidInvoice.lines.has_more) throw new Error("Initial upgrade payment requires reconciliation");
            const claimResult = await supabaseAdmin.from("content_credit_upgrades").select("id,workspace_id,period_id,delta_credits,stripe_subscription_id,stripe_invoice_id,stripe_price_id,stripe_request_key,proration_at,from_plan,status").eq("id", freeClaimId).eq("workspace_id", freeWorkspaceId).maybeSingle();
            const claim = claimResult.data;
            if (claimResult.error || !claim || claim.from_plan !== "free" || (claim.stripe_subscription_id && claim.stripe_subscription_id !== paidSubscriptionId) || (claim.stripe_invoice_id && claim.stripe_invoice_id !== paidInvoice.id) || !["pending", "payment_pending", "reconciliation_required", "paid"].includes(claim.status)) throw new Error("Initial upgrade claim mismatch");
            const customer = await supabaseAdmin.from("credit_payment_customers").select("stripe_customer_id,status").eq("workspace_id", freeWorkspaceId).maybeSingle();
            if (customer.error || customer.data?.stripe_customer_id !== paidCustomerId || customer.data.status !== "ready") throw new Error("Initial upgrade customer mismatch");
            const period = await supabaseAdmin.from("content_credit_periods").select("ends_at").eq("id", claim.period_id).eq("workspace_id", freeWorkspaceId).single();
            if (period.error || !period.data) throw new Error("Initial upgrade period missing");
            const lines = paidInvoice.lines.data.filter((line: Stripe.InvoiceLineItem) => invoiceLinePrice(line) === claim.stripe_price_id && line.period.end * 1000 === Date.parse(period.data.ends_at));
            if (lines.length !== 1 || !claim.proration_at || Math.abs(lines[0].period.start - claim.proration_at) > 60) throw new Error("Initial upgrade invoice does not match claim");
            const existing = await supabaseAdmin.from("workspace_subscriptions").select("stripe_subscription_id,stripe_customer_id").eq("workspace_id", freeWorkspaceId).maybeSingle();
            if (existing.error || (existing.data?.stripe_customer_id && existing.data.stripe_customer_id !== paidCustomerId)) throw new Error("Initial upgrade subscription binding conflict");
            if (existing.data?.stripe_subscription_id && existing.data.stripe_subscription_id !== paidSubscriptionId) {
              const previous = await stripe.subscriptions.retrieve(existing.data.stripe_subscription_id);
              const previousCustomer = typeof previous.customer === "string" ? previous.customer : previous.customer.id;
              if (!mayReplaceSubscription(previous.status, previousCustomer, paidCustomerId)) throw new Error("Previous subscription is not terminal");
            }
            const adjustment = await supabaseAdmin.rpc("add_content_credit_adjustment", { _workspace_id: freeWorkspaceId, _period_id: claim.period_id, _credits: claim.delta_credits, _source_key: `stripe:upgrade:${paidInvoice.id}` });
            if (adjustment.error) throw new Error("Initial upgrade credit grant failed");
            const bound = await supabaseAdmin.from("workspace_subscriptions").upsert({ workspace_id: freeWorkspaceId, stripe_customer_id: paidCustomerId, stripe_subscription_id: paidSubscriptionId, stripe_price_id: claim.stripe_price_id, plan_key: "starter", billing_period: "monthly", currency: "gbp", subscription_status: paidSubscription.status, current_period_start: new Date(paidSubscription.items.data[0].current_period_start * 1000).toISOString(), current_period_end: new Date(paidSubscription.items.data[0].current_period_end * 1000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
            if (bound.error) throw new Error("Initial upgrade subscription binding failed");
            const marked = await supabaseAdmin.from("content_credit_upgrades").update({ status: "paid", stripe_invoice_id: paidInvoice.id, stripe_subscription_id: paidSubscriptionId, updated_at: new Date().toISOString() }).eq("id", claim.id);
            if (marked.error) throw new Error("Initial upgrade claim update failed");
            const operation = await supabaseAdmin.from("content_credit_billing_operations").select("id").eq("workspace_id", freeWorkspaceId).eq("kind", "upgrade").eq("operation_key", claim.stripe_request_key).single();
            if (operation.error || !operation.data) throw new Error("Initial upgrade billing operation missing");
            const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: operation.data.id, _status: "completed", _external_id: paidInvoice.id });
            if (resolved.error) throw new Error("Initial upgrade billing operation could not be resolved");
            break;
          }
          const { data: paidSubRecord } = await supabaseAdmin
            .from("workspace_subscriptions")
            .select("workspace_id")
            .eq("stripe_customer_id", paidCustomerId)
            .eq("stripe_subscription_id", paidSubscriptionId)
            .maybeSingle();

          // Invoice delivery can precede checkout.session.completed. Return an
          // error so Stripe retries once the workspace/customer binding exists.
          if (!paidSubRecord) throw new Error("Paid invoice has no workspace subscription binding");

          if (paidSubRecord) {
            const priceId = paidSubscription.items.data[0]?.price?.id;
            const planInfo = priceId ? PRICE_TO_PLAN[priceId] : undefined;
            if (!planInfo) throw new Error("Unrecognized subscription price");

            if (["subscription_create", "subscription_cycle"].includes(paidInvoice.billing_reason ?? "")) {
              if (paidInvoice.lines.has_more) throw new Error("Invoice lines require pagination before credit grant");
              const lines = paidInvoice.lines.data.filter((item: Stripe.InvoiceLineItem) => { const price = invoiceLinePrice(item); return price && PRICE_TO_PLAN[price] && !invoiceLineProration(item); });
              if (lines.length !== 1) throw new Error("Paid invoice does not identify one monthly plan");
              const line = lines[0];
              const linePriceId = line ? invoiceLinePrice(line) : undefined;
              const invoicePlan = linePriceId ? PRICE_TO_PLAN[linePriceId] : undefined;
              const grants: Record<string, number> = { starter: 1000, growth: 1800, scale: 5000, pro: 8000 };
              if (!line?.period?.start || !line.period.end || !invoicePlan || invoicePlan.billing_period !== "monthly") throw new Error("Paid invoice has no supported monthly credit period");
              const grant = await supabaseAdmin.rpc("activate_paid_content_credit_period", {
                _workspace_id: paidSubRecord.workspace_id,
                _starts_at: new Date(line.period.start * 1000).toISOString(),
                _ends_at: new Date(line.period.end * 1000).toISOString(),
                _granted: grants[invoicePlan.plan_key],
                _source_key: `stripe:invoice:${paidInvoice.id}`,
              });
              if (grant.error) throw new Error(`Credit grant failed: ${grant.error.message}`);
            }
            if (paidInvoice.billing_reason === "subscription_update") {
              if (paidInvoice.status !== "paid" || paidInvoice.lines.has_more) throw new Error("Upgrade payment requires reconciliation");
              const lookup = await supabaseAdmin.from("content_credit_upgrades").select("id,period_id,delta_credits,stripe_invoice_id,stripe_price_id,stripe_request_key,proration_at,status")
                .eq("workspace_id", paidSubRecord.workspace_id).eq("stripe_subscription_id", paidSubscriptionId)
                .in("status", ["pending", "payment_pending", "reconciliation_required", "paid"]).order("created_at", { ascending: false }).limit(10);
              if (lookup.error) throw new Error("Upgrade claim lookup failed");
              const claim = (lookup.data ?? []).find((item) => item.stripe_invoice_id === paidInvoice.id) ??
                (lookup.data ?? []).find((item) => !item.stripe_invoice_id && ["pending", "reconciliation_required"].includes(item.status) && paidInvoice.lines.data.some((line: Stripe.InvoiceLineItem) => invoiceLinePrice(line) === item.stripe_price_id && invoiceLineProration(line) && line.period.start === item.proration_at));
              if (!claim) throw new Error("Paid upgrade has no matching claim");
              if (!paidInvoice.lines.data.some((line: Stripe.InvoiceLineItem) => invoiceLinePrice(line) === claim.stripe_price_id && invoiceLineProration(line) && line.period.start === claim.proration_at)) throw new Error("Upgrade invoice does not match claim");
              const grant = await supabaseAdmin.rpc("add_content_credit_adjustment", { _workspace_id: paidSubRecord.workspace_id, _period_id: claim.period_id, _credits: claim.delta_credits, _source_key: `stripe:upgrade:${paidInvoice.id}` });
              if (grant.error) throw new Error(`Upgrade credit grant failed: ${grant.error.message}`);
              const marked = await supabaseAdmin.from("content_credit_upgrades").update({ status: "paid", stripe_invoice_id: paidInvoice.id, updated_at: new Date().toISOString() }).eq("id", claim.id);
              if (marked.error) throw new Error("Upgrade could not be marked paid");
              const operation = await supabaseAdmin.from("content_credit_billing_operations").select("id").eq("workspace_id", paidSubRecord.workspace_id).eq("kind", "upgrade").eq("operation_key", claim.stripe_request_key).single();
              if (operation.error || !operation.data) throw new Error("Upgrade billing operation missing");
              const resolved = await supabaseAdmin.rpc("resolve_content_credit_billing_operation", { _id: operation.data.id, _status: "completed", _external_id: paidInvoice.id });
              if (resolved.error) throw new Error("Upgrade billing operation could not be resolved");
            }

            await supabaseAdmin
              .from("workspace_subscriptions")
              .update({
                subscription_status: paidSubscription.status,
                current_period_start: new Date(paidSubscription.items.data[0].current_period_start * 1000).toISOString(),
                current_period_end: new Date(paidSubscription.items.data[0].current_period_end * 1000).toISOString(),
                plan_key: planInfo.plan_key,
                billing_period: planInfo.billing_period,
                updated_at: new Date().toISOString(),
              })
              .eq("workspace_id", paidSubRecord.workspace_id);

            logStep("Subscription set to active after payment", { workspaceId: paidSubRecord.workspace_id });

            // Handle agency commission for this invoice
            await handleCommissionForInvoice(
              supabaseAdmin,
              paidSubRecord.workspace_id,
              paidInvoice,
              planInfo,
              paidSubscription.status,
              paidSubscription.trial_end
            );

            // Send payment success confirmation email
            try {
              const customer = await stripe.customers.retrieve(paidCustomerId);
              const customerEmail = (customer as Stripe.Customer).email;
              const customerName = (customer as Stripe.Customer).name || customerEmail?.split("@")[0] || "there";
              const firstName = customerName.split(" ")[0];

              const { data: ws } = await supabaseAdmin.from("workspaces").select("name").eq("id", paidSubRecord.workspace_id).single();

              const amount = paidInvoice.amount_paid ? `£${(paidInvoice.amount_paid / 100).toFixed(2)}` : "N/A";
              const invoiceNumber = paidInvoice.number || paidInvoice.id;
              const invoiceDate = new Date((paidInvoice.created || 0) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
              const planName = planInfo.plan_key.charAt(0).toUpperCase() + planInfo.plan_key.slice(1).replace("_", " ");

              const LOGO_URL = "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-white.png";

              const successHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,hsl(330,80%,52%),hsl(280,60%,55%));border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="AutoSocials" width="160" style="display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:40px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:56px;height:56px;border-radius:50%;background-color:#dcfce7;display:inline-flex;align-items:center;justify-content:center;">
              <span style="font-size:28px;">✓</span>
            </div>
          </div>
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#1a1a2e;text-align:center;">Payment Successful</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">Hi ${firstName},</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">Great news — your payment has been processed successfully and your ${ws?.name || "account"} is fully active.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:13px;color:#9ca3af;">Amount</span><br/>
              <span style="font-size:15px;font-weight:600;color:#1a1a2e;">${amount}</span>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:13px;color:#9ca3af;">Plan</span><br/>
              <span style="font-size:15px;font-weight:600;color:#1a1a2e;">${planName} (${planInfo.billing_period})</span>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:13px;color:#9ca3af;">Invoice</span><br/>
              <span style="font-size:15px;font-weight:600;color:#1a1a2e;">${invoiceNumber}</span>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <span style="font-size:13px;color:#9ca3af;">Date</span><br/>
              <span style="font-size:15px;font-weight:600;color:#1a1a2e;">${invoiceDate}</span>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="https://autosocialsapp.lovable.app/app/billing" target="_blank" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,hsl(330,80%,52%),hsl(280,60%,55%));color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">View Billing & Invoices</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#9ca3af;">Thank you,<br/><strong>The AutoSocials Team</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

              if (customerEmail) {
                const sendgridKey = Deno.env.get("SENDGRID_API_KEY");
                if (sendgridKey) {
                  const sgPayload = {
                    personalizations: [{
                      to: [{ email: customerEmail }],
                      bcc: [{ email: "info@autosocials.com" }],
                    }],
                    from: { email: "info@autosocials.com", name: "AutoSocials" },
                    subject: `Payment confirmed for ${ws?.name || "your account"} — you're all set`,
                    content: [{ type: "text/html", value: successHtml }],
                    ip_pool_name: "autosocials_pool",
                  };

                  await fetch("https://api.sendgrid.com/v3/mail/send", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${sendgridKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(sgPayload),
                  });

                  logStep("Payment success email sent", { to: customerEmail });
                }
              }
            } catch (emailError) {
              logStep("Failed to send success email (non-fatal)", { error: String(emailError) });
            }
          }
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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
