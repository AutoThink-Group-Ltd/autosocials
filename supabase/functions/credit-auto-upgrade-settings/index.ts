import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { invoiceSubscriptionId } from "../stripe-webhook/stripe-payload.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  try {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return reply(401, { error: "Unauthorized" });
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const identity = await client.auth.getClaims(auth.slice(7));
    const userId = identity.data?.claims?.sub;
    if (identity.error || typeof userId !== "string") return reply(401, { error: "Unauthorized" });
    const body = await request.json();
    if (typeof body.workspace_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.workspace_id) || (body.action !== "status" && typeof body.enabled !== "boolean")) return reply(400, { error: "Invalid settings" });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const owner = await admin.rpc("is_workspace_owner", { _workspace_id: body.workspace_id, _user_id: userId });
    if (body.action === "status") {
      const access = await admin.rpc("can_access_workspace", { _workspace_id: body.workspace_id, _user_id: userId });
      if (access.error || !access.data || owner.error) return reply(403, { error: "Workspace access required" });
      const [preference, payment, subscription] = await Promise.all([
        admin.from("content_credit_preferences").select("automatic_upgrade").eq("workspace_id", body.workspace_id).maybeSingle(),
        admin.from("credit_payment_customers").select("status,payment_method_id").eq("workspace_id", body.workspace_id).maybeSingle(),
        admin.from("workspace_subscriptions").select("stripe_subscription_id,subscription_status").eq("workspace_id", body.workspace_id).maybeSingle(),
      ]);
      if (preference.error || payment.error || subscription.error) throw new Error("Could not read upgrade settings");
      let paymentActionUrl: string | null = null;
      if (owner.data) {
        const pending = await admin.from("content_credit_upgrades").select("stripe_invoice_id,stripe_subscription_id").eq("workspace_id", body.workspace_id).eq("status", "payment_pending").maybeSingle();
        if (pending.error) throw pending.error;
        if (pending.data?.stripe_invoice_id && pending.data.stripe_subscription_id) {
          const key = Deno.env.get("STRIPE_SECRET_KEY");
          if (!key) throw new Error("Billing is unavailable");
          const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
          const invoice = await stripe.invoices.retrieve(pending.data.stripe_invoice_id);
          if (invoiceSubscriptionId(invoice) !== pending.data.stripe_subscription_id) throw new Error("Pending invoice binding mismatch");
          if (invoice.status === "open" && invoice.hosted_invoice_url) paymentActionUrl = invoice.hosted_invoice_url;
        }
      }
      return reply(200, { enabled: preference.data?.automatic_upgrade === true, ready: Deno.env.get("CONTENT_CREDIT_AUTO_UPGRADE_READY") !== "false", owner: !!owner.data, payment_ready: !!(payment.data?.status === "ready" && payment.data.payment_method_id) || !!(subscription.data?.stripe_subscription_id && subscription.data.subscription_status === "active"), payment_action_url: paymentActionUrl });
    }
    if (owner.error || !owner.data) return reply(403, { error: "Only the workspace owner can change billing settings" });
    if (body.enabled && Deno.env.get("CONTENT_CREDIT_AUTO_UPGRADE_READY") === "false") return reply(503, { error: "Automatic upgrades are not available yet" });
    if (body.enabled) {
      const subscription = await admin.from("workspace_subscriptions").select("stripe_subscription_id,subscription_status").eq("workspace_id", body.workspace_id).maybeSingle();
      if (subscription.error) throw subscription.error;
      if (!subscription.data?.stripe_subscription_id || subscription.data.subscription_status !== "active") {
        const payment = await admin.from("credit_payment_customers").select("status,payment_method_id").eq("workspace_id", body.workspace_id).maybeSingle();
        if (payment.error) throw payment.error;
        if (payment.data?.status !== "ready" || !payment.data.payment_method_id) return reply(409, { error: "Set up a payment method before enabling automatic upgrades", setup_required: true });
      }
    }
    const saved = await admin.from("content_credit_preferences").upsert({ workspace_id: body.workspace_id, automatic_upgrade: body.enabled }, { onConflict: "workspace_id" });
    if (saved.error) throw saved.error;
    return reply(200, { enabled: body.enabled });
  } catch {
    return reply(500, { error: "Could not save automatic upgrade settings" });
  }
});
