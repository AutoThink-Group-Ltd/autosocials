/**
 * Approved brand baseline (release 1.0.0) — used ONLY for comparison on the
 * Super Admin Brand Identity page. Live swatches are always read from CSS;
 * these values never feed what is displayed as "observed".
 */
import { brandTokens, BRAND_VERSION } from "./tokens";

export const APPROVED_VERSION = BRAND_VERSION;

export type TokenCategory = "core" | "alias" | "semantic" | "legacy";

export interface TokenSpec {
  /** CSS custom property actually defined in src/styles.css */
  cssVar: string;
  /** Canonical brand token name from the brief (e.g. --as-canvas) */
  canonical?: string;
  role: string;
  category: TokenCategory;
  /** Approved HEX, when the brief defines one */
  approved?: string;
  /** Alias relationship, e.g. "primary → ink" */
  aliasOf?: string;
  /** Real Tailwind utilities registered in @theme inline */
  utilities: string[];
  note?: string;
}

const t = brandTokens;

export const TOKEN_REGISTRY: TokenSpec[] = [
  // Core palette
  { cssVar: "--canvas", canonical: "--as-canvas", role: "Warm ivory canvas", category: "core", approved: t.canvas, utilities: ["bg-canvas"], note: "Sam pane, marketing and page background." },
  { cssVar: "--surface", canonical: "--as-surface", role: "Paper white surface", category: "core", approved: t.surface, utilities: ["bg-surface"], note: "Live View canvas, forms, popovers." },
  { cssVar: "--surface-subtle", canonical: "--as-surface-subtle", role: "Quiet inset surface", category: "core", approved: t["surface-subtle"], utilities: ["bg-surface-subtle"], note: "Hover and inset areas." },
  { cssVar: "--ink", canonical: "--as-ink", role: "Carbon ink", category: "core", approved: t.ink, utilities: ["text-ink", "bg-ink"], note: "Primary text, primary actions, logo, carbon navigation." },
  { cssVar: "--ink-hover", canonical: "--as-ink-hover", role: "Carbon hover", category: "core", approved: t["ink-hover"], utilities: ["bg-ink-hover"], note: "Hover on carbon actions." },
  { cssVar: "--text-secondary", canonical: "--as-text-secondary", role: "Secondary text", category: "core", approved: t["text-secondary"], utilities: ["text-text-secondary"], note: "Secondary text and ordinary icons on light surfaces." },
  { cssVar: "--muted-foreground", canonical: "--as-text-muted", role: "Muted metadata", category: "core", approved: t["text-muted"], utilities: ["text-muted-foreground"], note: "Timestamps and metadata. Keep at 12px or larger." },
  { cssVar: "--border", canonical: "--as-border-subtle", role: "Subtle divider", category: "core", approved: t["border-subtle"], utilities: ["border-border"], note: "Decorative dividers only — not enough for essential controls." },
  { cssVar: "--border-control", canonical: "--as-border-control", role: "Control boundary", category: "core", approved: t["border-control"], utilities: ["border-border-control"], note: "Inputs and essential control edges." },
  { cssVar: "--silver", canonical: "--as-silver", role: "Restrained silver", category: "core", approved: t.silver, utilities: ["text-silver"], note: "Decorative detail and secondary text on carbon. Never ordinary text on ivory/white." },
  { cssVar: "--inverse", canonical: "--as-inverse", role: "Inverse (on carbon)", category: "core", approved: t.inverse, utilities: ["text-inverse"], note: "Text and icons on carbon." },
  { cssVar: "--primary", canonical: "--as-selected-bg", role: "Selected fill", category: "core", approved: t["selected-bg"], aliasOf: "ink", utilities: ["bg-primary"], note: "Selected controls on light surfaces." },
  { cssVar: "--primary-foreground", canonical: "--as-selected-fg", role: "On selected fill", category: "core", approved: t["selected-fg"], aliasOf: "inverse", utilities: ["text-primary-foreground"] },

  // Semantic
  { cssVar: "--destructive", canonical: "--as-danger", role: "Danger", category: "semantic", approved: t.danger, utilities: ["text-destructive", "bg-destructive"], note: "Actual errors and destructive actions only." },
  { cssVar: "--danger-surface", canonical: "--as-danger-surface", role: "Danger surface", category: "semantic", approved: t["danger-surface"], utilities: ["bg-danger-surface"] },
  { cssVar: "--warning", canonical: "--as-warning", role: "Warning", category: "semantic", approved: t.warning, utilities: ["text-warning"], note: "Actual warnings or blocked states." },
  { cssVar: "--warning-surface", canonical: "--as-warning-surface", role: "Warning surface", category: "semantic", approved: t["warning-surface"], utilities: ["bg-warning-surface"] },

  // Framework aliases
  { cssVar: "--background", role: "Background", category: "alias", approved: t.canvas, aliasOf: "canvas", utilities: ["bg-background"] },
  { cssVar: "--foreground", role: "Foreground", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-foreground"] },
  { cssVar: "--card", role: "Card", category: "alias", approved: t.surface, aliasOf: "surface", utilities: ["bg-card"] },
  { cssVar: "--card-foreground", role: "Card foreground", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-card-foreground"] },
  { cssVar: "--popover", role: "Popover", category: "alias", approved: t.surface, aliasOf: "surface", utilities: ["bg-popover"] },
  { cssVar: "--popover-foreground", role: "Popover foreground", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-popover-foreground"] },
  { cssVar: "--secondary", role: "Secondary", category: "alias", approved: t["surface-subtle"], aliasOf: "surface-subtle", utilities: ["bg-secondary"] },
  { cssVar: "--secondary-foreground", role: "Secondary foreground", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-secondary-foreground"] },
  { cssVar: "--muted", role: "Muted", category: "alias", approved: t["surface-subtle"], aliasOf: "surface-subtle", utilities: ["bg-muted"] },
  { cssVar: "--accent", role: "Accent", category: "alias", approved: t["surface-subtle"], aliasOf: "surface-subtle", utilities: ["bg-accent"] },
  { cssVar: "--accent-foreground", role: "Accent foreground", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-accent-foreground"] },
  { cssVar: "--destructive-foreground", role: "Destructive foreground", category: "alias", approved: t.inverse, aliasOf: "inverse", utilities: ["text-destructive-foreground"] },
  { cssVar: "--input", role: "Input border", category: "alias", approved: t["border-control"], aliasOf: "border-control", utilities: ["border-input"] },
  { cssVar: "--ring", role: "Focus ring", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["ring-ring"] },
  { cssVar: "--sidebar-background", role: "Carbon navigation", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["bg-sidebar"] },
  { cssVar: "--sidebar-foreground", role: "Navigation text", category: "alias", approved: t.silver, aliasOf: "silver", utilities: ["text-sidebar-foreground"] },
  { cssVar: "--sidebar-primary", role: "Navigation selected", category: "alias", approved: t.canvas, aliasOf: "canvas", utilities: ["bg-sidebar-primary"] },
  { cssVar: "--sidebar-primary-foreground", role: "On navigation selected", category: "alias", approved: t.ink, aliasOf: "ink", utilities: ["text-sidebar-primary-foreground"] },
  { cssVar: "--sidebar-accent", role: "Navigation hover", category: "alias", approved: t["ink-hover"], aliasOf: "ink-hover", utilities: ["bg-sidebar-accent"] },
  { cssVar: "--sidebar-accent-foreground", role: "On navigation hover", category: "alias", approved: t.inverse, aliasOf: "inverse", utilities: ["text-sidebar-accent-foreground"] },
  { cssVar: "--sidebar-border", role: "Navigation divider", category: "alias", approved: t["ink-hover"], aliasOf: "ink-hover", utilities: ["border-sidebar-border"] },
  { cssVar: "--sidebar-ring", role: "Navigation focus", category: "alias", approved: t.canvas, aliasOf: "canvas", utilities: ["ring-sidebar-ring"] },

  // Legacy names kept so old screens resolve to monochrome
  { cssVar: "--brand-pink", role: "Legacy “brand pink”", category: "legacy", approved: t.ink, aliasOf: "ink", utilities: ["text-brand-pink", "bg-brand-pink"], note: "Legacy name. Must stay monochrome; pink is a rejected accent." },
  { cssVar: "--brand-purple", role: "Legacy “brand purple”", category: "legacy", approved: t["text-secondary"], aliasOf: "text-secondary", utilities: ["text-brand-purple"], note: "Legacy name. Must stay monochrome; purple is a rejected accent." },
];

export const CONTRAST_PAIRS: { fg: string; bg: string; label: string; min: number }[] = [
  { fg: "--ink", bg: "--canvas", label: "Ink on ivory", min: 4.5 },
  { fg: "--text-secondary", bg: "--canvas", label: "Secondary on ivory", min: 4.5 },
  { fg: "--muted-foreground", bg: "--canvas", label: "Muted on ivory", min: 4.5 },
  { fg: "--muted-foreground", bg: "--surface-subtle", label: "Muted on subtle surface", min: 4.5 },
  { fg: "--inverse", bg: "--ink", label: "White on carbon", min: 4.5 },
  { fg: "--border-control", bg: "--canvas", label: "Control border on ivory", min: 3 },
  { fg: "--silver", bg: "--surface", label: "Silver on white (decorative only)", min: 4.5 },
];

export const SHADOW_TOKENS = [
  { cssVar: "--shadow-soft", utility: "shadow-soft", role: "Hairline lift" },
  { cssVar: "--shadow-card", utility: "shadow-card", role: "Card" },
  { cssVar: "--shadow-elevated", utility: "shadow-elevated", role: "Popover / elevated", approved: "0 8px 28px rgb(23 23 21 / 10%)" },
];

export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
