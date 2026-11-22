/** Shared lease policy. Claims are fenced separately by token, status and timestamp in SQL. */
export const PERSONAL_LEASE_MS = 20 * 60_000;
export function personalLeaseIsActive(status: string, updatedAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(updatedAt);
  return status === "running" && Number.isFinite(timestamp) && now - timestamp < PERSONAL_LEASE_MS;
}
export function personalSourceIsCurrent(previous: string | null | undefined, current: string | null | undefined, status: string | null | undefined): boolean {
  return !!previous && status === "complete" && previous === current;
}
/** Commit only while this worker retains the running lease; failed claims retain last result. */
export async function commitPersonalLease(db: any, key: Record<string, string>, token: string, result: unknown): Promise<boolean> {
  const saved = await db.from("brand_work_operations").update({ status: "complete", result, updated_at: new Date().toISOString() }).match(key).eq("token", token).eq("status", "running").select("token").maybeSingle();
  if (saved.error) throw new Error("Could not save personal review work");
  return !!saved.data;
}
