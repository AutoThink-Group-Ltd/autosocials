import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { providerBillingFilter, providerBillingInput } from "./provider-billing";

export const getProviderBilling = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerBillingFilter.parse(input))
  .handler(async ({ data, context }) => (await import("./provider-billing.server")).readProviderBilling(context as Parameters<typeof import("./provider-billing.server").readProviderBilling>[0], data));

export const recordProviderCharge = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerBillingInput.parse(input))
  .handler(async ({ data, context }) => (await import("./provider-billing.server")).recordProviderBilling(context as Parameters<typeof import("./provider-billing.server").recordProviderBilling>[0], data));
