export type PlanKey = 'starter' | 'growth' | 'scale' | 'pro';
export type Currency = 'gbp' | 'usd' | 'eur' | 'aed';
export type BillingPeriod = 'monthly';

export const CURRENCY_SYMBOLS: Record<Currency, { symbol: string; position: 'before' | 'after' }> = {
  gbp: { symbol: '£', position: 'before' },
  usd: { symbol: '$', position: 'before' },
  eur: { symbol: '€', position: 'before' },
  aed: { symbol: 'AED', position: 'after' },
};

// Approximate conversion rates from GBP (updated periodically)
const CURRENCY_RATES: Record<Currency, number> = {
  gbp: 1,
  usd: 1.27,
  eur: 1.17,
  aed: 4.67,
};

export const SHARED_FEATURES: string[] = [
  'TikTok & Instagram discovery',
  'Bulk outreach & templates',
  'Custom email domain',
  'Commission management',
  'Collaboration board',
  'AI outreach generation',
  'Email signatures',
];

export const PLANS = {
  starter: { name: 'Starter', prices: { monthly: { price_id: 'price_1T9w3sE8YDONFUnR41GC6zK7', amount: 4900 } } },
  growth: { name: 'Growth', prices: { monthly: { price_id: 'price_1T9w3uE8YDONFUnRPrlnIJvX', amount: 7900 } } },
  scale: { name: 'Scale', prices: { monthly: { price_id: 'price_1TALm0E8YDONFUnROektjSnb', amount: 19900 } } },
  pro: { name: 'Pro', prices: { monthly: { price_id: 'price_1TDyFWE8YDONFUnRRgkHPM7c', amount: 29900 } } },
} as const;

export const PLAN_ORDER: PlanKey[] = ['starter', 'growth', 'scale', 'pro'];

export function formatPrice(amount: number, currency: Currency = 'gbp', round = false): string {
  const converted = Math.round(amount * CURRENCY_RATES[currency]);
  const value = converted / 100;
  const { symbol, position } = CURRENCY_SYMBOLS[currency];
  
  const displayValue = round || value >= 100
    ? Math.round(value).toString()
    : value.toFixed(2);
  
  return position === 'before'
    ? `${symbol}${displayValue}`
    : `${displayValue} ${symbol}`;
}

export function detectCurrency(): Currency {
  const saved = localStorage.getItem('preferred_currency') as Currency | null;
  if (saved && CURRENCY_SYMBOLS[saved]) return saved;
  
  try {
    const locale = navigator.language || 'en-GB';
    if (locale.endsWith('-AE') || locale.endsWith('-SA')) return 'aed';
    if (locale.endsWith('-US') || locale.endsWith('-CA')) return 'usd';
    if (locale.endsWith('-GB') || locale.endsWith('-AU') || locale.endsWith('-NZ')) return 'gbp';
    if (['de', 'fr', 'es', 'it', 'nl', 'pt'].some(l => locale.startsWith(l))) return 'eur';
  } catch {}
  
  return 'gbp';
}

export function saveCurrency(currency: Currency) {
  localStorage.setItem('preferred_currency', currency);
}
