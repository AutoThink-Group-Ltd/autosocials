/** Shared, client-safe invite rules. */
export type AgencyStaffRole = "owner" | "admin" | "member";
export type InviteKind = "agency" | "workspace";

export const INVITE_TTL_DAYS = 7;

/** An invite link works once, only while pending and before it expires. */
export function isInviteUsable(status: string | null | undefined, expiresAt: string | null | undefined, now = new Date()): boolean {
  if (status !== "pending") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > now.getTime();
}

/** Owners and admins manage billing, team and agency settings; members only work on assigned clients. */
export function canManageAgency(role: AgencyStaffRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Agency pages hidden from members (assigned-clients only). */
export const AGENCY_ADMIN_ONLY_PATHS = [
  "/agency/team", "/agency/revenue", "/agency/referrals", "/agency/settings", "/agency/invites", "/agency/leads",
];

export function agencyPathAllowed(path: string, role: AgencyStaffRole | null | undefined): boolean {
  if (canManageAgency(role)) return true;
  return !AGENCY_ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/** Members see a client when access is "all" or the client is in their list. Admins see every client. */
export function memberSeesClient(
  emp: { role: string | null; client_access: string | null; client_ids: string[] | null },
  clientId: string,
): boolean {
  if (emp.role === "admin" || emp.client_access === "all") return true;
  return (emp.client_ids ?? []).includes(clientId);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
