import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (Deno.env.get("CONTENT_CREDIT_AUTO_UPGRADE_READY") === "false") return json(503, { error: "Automatic upgrades are not available yet" });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: auth } } });
    const identity = await userClient.auth.getClaims(auth.slice(7));
    const user = identity.data?.claims;
    if (identity.error || typeof user?.sub !== "string") return json(401, { error: "Unauthorized" });
    const body = await req.json();
    if (typeof body.workspace_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.workspace_id)) return json(400, { error: "Invalid workspace" });
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const owner = await db.rpc("is_workspace_owner", { _workspace_id: body.workspace_id, _user_id: user.sub });
    if (owner.error || !owner.data) return json(403, { error: "Only the workspace owner can set up billing" });
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe is not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const binding = await db.from("credit_payment_customers").select("stripe_customer_id").eq("workspace_id", body.workspace_id).maybeSingle();
    if (binding.error) throw binding.error;
    let customerId = binding.data?.stripe_customer_id as string | undefined;
    const subscriptionBinding = await db.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", body.workspace_id).maybeSingle();
    if (subscriptionBinding.error) throw subscriptionBinding.error;
    if (customerId && subscriptionBinding.data?.stripe_customer_id && customerId !== subscriptionBinding.data.stripe_customer_id) throw new Error("Workspace billing needs reconciliation");
    if (!customerId && subscriptionBinding.data?.stripe_customer_id) {
      customerId = subscriptionBinding.data.stripe_customer_id;
      const stored = await db.from("credit_payment_customers").upsert({ workspace_id: body.workspace_id, stripe_customer_id: customerId, status: "pending" }, { onConflict: "workspace_id", ignoreDuplicates: true });
      if (stored.error) throw stored.error;
      const confirmed = await db.from("credit_payment_customers").select("stripe_customer_id").eq("workspace_id", body.workspace_id).single();
      if (confirmed.error || confirmed.data?.stripe_customer_id !== customerId) throw new Error("Customer binding failed");
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ ...(typeof user.email === "string" ? { email: user.email } : {}), metadata: { workspace_id: body.workspace_id } }, { idempotencyKey: `credit-customer:${body.workspace_id}` });
      const stored = await db.from("credit_payment_customers").upsert({ workspace_id: body.workspace_id, stripe_customer_id: customer.id, status: "pending" }, { onConflict: "workspace_id", ignoreDuplicates: true });
      if (stored.error) throw stored.error;
      const confirmed = await db.from("credit_payment_customers").select("stripe_customer_id").eq("workspace_id", body.workspace_id).single();
      if (confirmed.error || !confirmed.data) throw new Error("Customer binding failed");
      customerId = confirmed.data.stripe_customer_id;
    }
    const origin = Deno.env.get("SITE_URL") || "https://autosocials.com";
    const session = await stripe.checkout.sessions.create({ mode: "setup", customer: customerId, currency: "gbp", metadata: { workspace_id: body.workspace_id, user_id: user.sub, purpose: "credit_auto_upgrade" }, success_url: `${origin}/app/billing?setup=complete`, cancel_url: `${origin}/app/billing?setup=canceled` });
    if (!session.url) throw new Error("Setup checkout unavailable");
    const saved = await db.from("credit_payment_customers").update({ setup_checkout_session_id: session.id, status: "pending", updated_at: new Date().toISOString() }).eq("workspace_id", body.workspace_id).eq("stripe_customer_id", customerId);
    if (saved.error) throw saved.error;
    return json(200, { url: session.url });
  } catch { return json(500, { error: "Could not start payment setup" }); }
});
