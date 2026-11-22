/** Browser-safe brand-context rules. Sam only plans content when she has a real source to work from. */
export type BrandContext = {
  /** True when Sam has at least one real source to plan from. */
  ready: boolean;
  files: number;
  docs: number;
  /** Website saved in workspace settings, used to prefill a scan. */
  website: string | null;
};

export const BRAND_CONTEXT_NEEDED =
  "Sam needs something to work from first — upload brand assets or scan your website so she isn't inventing your brand.";
