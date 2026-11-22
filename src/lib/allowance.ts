/** Default clips per workspace per calendar month when no allowance row exists. */
export const DEFAULT_MONTHLY_CLIPS = 12;

/** Retries of a failed render don't count; only successful or in-flight clips do. */
export function canStartRender(usedThisMonth: number, limit: number | null | undefined): boolean {
  return usedThisMonth < (limit ?? DEFAULT_MONTHLY_CLIPS);
}

/** A variant may be sent to publishing only once per lineage version. */
export function needsNewDraft(existingVariantIds: string[], variantId: string): boolean {
  return !existingVariantIds.includes(variantId);
}
