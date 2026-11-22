// Billing tool descriptors. Implementations live in their respective edge
// functions (create-checkout, update-subscription, customer-portal).
// All billing tools are RISKY and require explicit confirmation.

import { registerTool } from "../registry.ts";
import type { RegisteredTool } from "../types.ts";

const passthrough = (raw: unknown) => raw;
const serverOnly = async () => ({
  ok: false as const,
  error: { code: "server_only", message: "Invoke the matching edge function." },
});

export const billingCreateCheckoutTool: RegisteredTool = {
  name: "billing.create_checkout",
  description: "Create a Stripe Checkout session for the current workspace to start a subscription.",
  permissions: ["billing", "external"],
  requiresConfirmation: "user_confirmation",
  parseInput: passthrough,
  handler: serverOnly,
};

export const billingChangePlanTool: RegisteredTool = {
  name: "billing.change_plan",
  description: "Switch the workspace's active subscription to a different price (upgrade/downgrade).",
  permissions: ["billing", "write", "external"],
  requiresConfirmation: "user_confirmation",
  parseInput: passthrough,
  handler: serverOnly,
};

export const billingCancelSubscriptionTool: RegisteredTool = {
  name: "billing.cancel_subscription",
  description: "Cancel the workspace's active subscription at period end.",
  permissions: ["billing", "write", "external"],
  requiresConfirmation: "explicit_typed_confirmation",
  parseInput: passthrough,
  handler: serverOnly,
};

export const billingCustomerPortalTool: RegisteredTool = {
  name: "billing.open_customer_portal",
  description: "Open the Stripe Customer Portal for self-serve billing management.",
  permissions: ["billing", "external"],
  requiresConfirmation: "user_confirmation",
  parseInput: passthrough,
  handler: serverOnly,
};

for (const tool of [
  billingCreateCheckoutTool,
  billingChangePlanTool,
  billingCancelSubscriptionTool,
  billingCustomerPortalTool,
]) {
  registerTool(tool);
}