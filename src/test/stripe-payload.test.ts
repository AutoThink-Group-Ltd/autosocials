import { describe, expect, it } from "vitest";
import { invoiceSubscriptionId, invoiceLinePriceId, invoiceLineIsProration } from "../../supabase/functions/stripe-webhook/stripe-payload";

describe("Stripe invoice payload compatibility", () => {
  it("reads Basil invoice linkage and line details", () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_new" } } })).toBe("sub_new");
    const line = { pricing: { price_details: { price: "price_new" } }, parent: { subscription_item_details: { proration: true } } };
    expect(invoiceLinePriceId(line)).toBe("price_new");
    expect(invoiceLineIsProration(line)).toBe(true);
  });
  it("reads legacy payloads and does not invent missing identifiers", () => {
    expect(invoiceSubscriptionId({ subscription: { id: "sub_old" } })).toBe("sub_old");
    expect(invoiceLinePriceId({ price: { id: "price_old" } })).toBe("price_old");
    expect(invoiceLineIsProration({ proration: true })).toBe(true);
    expect(invoiceSubscriptionId({})).toBeUndefined();
    expect(invoiceLinePriceId({})).toBeUndefined();
  });
});
