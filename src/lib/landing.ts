/** Where a signed-in user lands. Super admins go to the Admin console first. */
export function landingPath(opts: { isSuperAdmin: boolean; accountType?: string | null; primaryWorkspaceId?: string | null }): string {
  if (opts.isSuperAdmin) return "/app/admin";
  if (opts.accountType === "agency" && !opts.primaryWorkspaceId) return "/agency";
  if (opts.primaryWorkspaceId) return "/app/create";
  return "/app/home";
}

export type PaneOrder = "sam-live" | "live-sam";
export type WorkspaceLayout = { order: PaneOrder; samCollapsed: boolean; navCollapsed: boolean };
export const DEFAULT_LAYOUT: WorkspaceLayout = { order: "sam-live", samCollapsed: false, navCollapsed: false };
