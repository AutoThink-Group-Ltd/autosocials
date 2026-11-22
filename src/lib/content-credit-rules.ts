/** Pure rules for credit accounting; durable reservations must be transactional. */
export type CreditPeriod = { granted: number; spent: number; reserved: number };

export function availableContentCredits(period: CreditPeriod): number {
  const values = [period.granted, period.spent, period.reserved];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid credit balance");
  }
  const available = period.granted - period.spent - period.reserved;
  if (available < 0) throw new Error("Credit balance is overdrawn");
  return available;
}

export function canReserveContentCredits(period: CreditPeriod, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid credit charge");
  return amount <= availableContentCredits(period);
}
