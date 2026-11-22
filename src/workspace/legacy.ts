/** Pre-rebuild logged-in pages kept for super-admin review (see docs/inventory.md). */
export type LegacyPage = { label: string; path: string; note: string; retired: boolean };

export const LEGACY_PAGES: LegacyPage[] = [
  { label: "Ask Vibe", path: "/app/ask-vibe", note: "Old home chat, replaced by Sam", retired: true },
  { label: "Discover creators", path: "/app/discover", note: "Creator live search", retired: true },
  { label: "Creator lists", path: "/app/lists", note: "Saved creator lists", retired: true },
  { label: "Messages", path: "/app/messages", note: "Outreach inbox", retired: true },
  { label: "Collaborations", path: "/app/collaborations", note: "Kanban pipeline", retired: true },
  { label: "Outreach templates", path: "/app/templates", note: "Email templates", retired: true },
  { label: "Insights", path: "/app/insights", note: "Deliverability reporting", retired: true },
  { label: "Activity", path: "/app/activity", note: "Event log", retired: true },
  { label: "Brand intelligence", path: "/app/brand-intelligence", note: "TikTok commercial data", retired: true },
  { label: "Commissions", path: "/app/commissions", note: "Creator commission rules", retired: true },
  { label: "Posts", path: "/app/publishing", note: "Old publishing posts page", retired: false },
  { label: "Calendar", path: "/app/publishing/calendar", note: "Publishing calendar", retired: false },
  { label: "Composer", path: "/app/publishing/composer", note: "Post composer", retired: false },
  { label: "Approvals", path: "/app/publishing/approvals", note: "Post approvals", retired: false },
  { label: "Hashtags", path: "/app/publishing/hashtags", note: "Hashtag groups", retired: false },
  { label: "Plan week", path: "/app/publishing/plan", note: "Weekly planner", retired: false },
  { label: "Bulk import", path: "/app/publishing/bulk-import", note: "CSV post import", retired: false },
  { label: "Team", path: "/app/team", note: "Team management", retired: false },
];

/** Retired paths: regular users are redirected; super admins may review them. */
export const RETIRED_PATHS = [...LEGACY_PAGES.filter((p) => p.retired).map((p) => p.path), "/app/creator"];

export const isRetiredPath = (pathname: string) =>
  RETIRED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

export const legacyPageFor = (pathname: string) =>
  LEGACY_PAGES.find((p) => pathname === p.path || (p.retired && pathname.startsWith(p.path + "/")));
