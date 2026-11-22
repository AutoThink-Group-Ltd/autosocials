/** Authority comes from the current user's message, never a file or model tool argument. */
export function explicitDirectVideoIntent(message: string): boolean {
  if (/\b(?:(?:do not|don't|never)\s+(?:start|render|(?:generate|create|produce)\s+(?:(?:this|the|a|any)\s+)?(?:video|film|animation))|not yet|before (?:you )?(?:generate|create)|review (?:this|my|the) (?:prompt|brief)|critique|rewrite|example only|hypothetical|planning to|would|could)\b/i.test(message)) return false;
  return /(?:^|[\n“"])(?:please\s+)?(?:create|generate|animate|produce|make)\b/i.test(message.trim())
    && /\b(?:video|film|animate|animation)\b/i.test(message);
}
