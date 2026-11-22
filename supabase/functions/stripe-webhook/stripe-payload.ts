type ObjectId = string | { id?: unknown } | null | undefined;
export function stripeObjectId(value: ObjectId): string | undefined {
  if (typeof value === "string") return value;
  return value && typeof value.id === "string" ? value.id : undefined;
}
export function invoiceSubscriptionId(invoice: unknown): string | undefined {
  const value = invoice as { subscription?: ObjectId; parent?: { subscription_details?: { subscription?: ObjectId } } };
  return stripeObjectId(value.parent?.subscription_details?.subscription) ?? stripeObjectId(value.subscription);
}
export function invoiceLinePriceId(line: unknown): string | undefined {
  const value = line as { price?: ObjectId; pricing?: { price_details?: { price?: ObjectId } } };
  return stripeObjectId(value.pricing?.price_details?.price) ?? stripeObjectId(value.price);
}
export function invoiceLineIsProration(line: unknown): boolean {
  const value = line as { proration?: boolean; parent?: { subscription_item_details?: { proration?: boolean }; invoice_item_details?: { proration?: boolean } } };
  return value.parent?.subscription_item_details?.proration ?? value.parent?.invoice_item_details?.proration ?? value.proration ?? false;
}
