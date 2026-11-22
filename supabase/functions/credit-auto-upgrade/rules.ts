/** Prorate only the incremental allowance, rounding down to whole credits. */
export function proratedCreditIncrease(current: number, next: number, start: number, end: number, at: number): number {
  if (![current, next, start, end, at].every(Number.isSafeInteger) || current < 0 || next <= current || end <= start || at < start || at >= end) throw new Error("Invalid upgrade period");
  return Math.floor((next - current) * (end - at) / (end - start));
}

export function mayReplaceSubscription(status: string, actualCustomer: string, workspaceCustomer: string | null | undefined): boolean {
  return (status === "canceled" || status === "incomplete_expired") && !!workspaceCustomer && actualCustomer === workspaceCustomer;
}

/** Attempt the saved method off-session; incomplete invoices need customer action. */
export const initialUpgradePaymentSettings = { payment_behavior: "allow_incomplete", off_session: true } as const;
