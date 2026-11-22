/**
 * AutoSocials brand release 1.0.0 — the single versioned token source.
 * CSS variables in src/styles.css mirror these values; the Super Admin brand
 * release record (brand_releases) stores the same object.
 */
export const BRAND_VERSION = "1.0.0";

export const brandTokens = {
  canvas: "#F5F3EE",
  surface: "#FFFFFF",
  "surface-subtle": "#EEEBE4",
  ink: "#171715",
  "ink-hover": "#2B2B27",
  "text-secondary": "#64615B",
  "text-muted": "#6D6962",
  "border-subtle": "#E4E1DA",
  "border-control": "#88847B",
  silver: "#B8B6B0",
  inverse: "#FFFFFF",
  "selected-bg": "#171715",
  "selected-fg": "#FFFFFF",
  danger: "#9D2D20",
  "danger-surface": "#FFF2EF",
  warning: "#805115",
  "warning-surface": "#FFF5E8",
} as const;

export const brandFonts = {
  display: '"Plus Jakarta Sans", "Inter", Arial, sans-serif',
  ui: '"Inter", Arial, sans-serif',
  editorial: '"Instrument Serif", Georgia, serif',
} as const;

export type ModuleId = "create" | "schedule" | "winners" | "campaigns" | "outreach" | "learn";

export const MODULES: { id: ModuleId; number: string; label: string; path: string; surface: string }[] = [
  { id: "create", number: "01", label: "Create Assets", path: "/app/create", surface: "Current asset" },
  { id: "schedule", number: "02", label: "Schedule", path: "/app/schedule", surface: "Social planner and live feeds" },
  { id: "winners", number: "03", label: "Find winners", path: "/app/winners", surface: "Shortlist" },
  { id: "campaigns", number: "04", label: "Launch ads", path: "/app/campaigns", surface: "Campaigns" },
  { id: "outreach", number: "", label: "Outreach", path: "/app/outreach", surface: "Campaigns and inbox" },
  { id: "learn", number: "05", label: "Learn & repeat", path: "/app/learn", surface: "Findings" },
];

export function currentModule(pathname: string): ModuleId {
  const m = MODULES.find((x) => pathname.startsWith(x.path));
  if (m) return m.id;
  if (pathname.startsWith("/app/publishing")) return "schedule";
  return "create";
}
