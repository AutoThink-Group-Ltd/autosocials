/** Fail closed when an upcoming invoice cannot establish an exact immediate charge. */
export function immediateProrationAmount(invoice: unknown): number {
  const value = invoice as { currency?: string; starting_balance?: number; total_discount_amounts?: unknown[]; total_taxes?: unknown[]; lines?: { has_more?: boolean; data?: Array<{ amount?: number; proration?: boolean; discount_amounts?: unknown[]; tax_amounts?: unknown[]; parent?: { type?: string; subscription_item_details?: { proration?: boolean } } }> } };
  if (value.currency !== "gbp" || (value.starting_balance ?? 0) !== 0 || value.total_discount_amounts?.length || value.total_taxes?.length || !value.lines || value.lines.has_more || !Array.isArray(value.lines.data)) throw new Error("Invoice preview needs manual review");
  let renewal = 0; let prorations = 0; let amount = 0;
  for (const line of value.lines.data) {
    if (!Number.isSafeInteger(line.amount) || line.discount_amounts?.length || line.tax_amounts?.length) throw new Error("Invoice preview needs manual review");
    if (line.parent?.subscription_item_details?.proration ?? line.proration ?? false) { prorations++; amount += line.amount!; }
    else if (line.parent?.type === "subscription_item_details") renewal++;
    else throw new Error("Invoice preview contains other charges");
  }
  if (renewal !== 1 || prorations < 1 || !Number.isSafeInteger(amount) || amount < 0) throw new Error("Invoice preview needs manual review");
  return amount;
}
