import { z } from "zod";

const item = z.object({ type: z.enum(["tile", "video", "written", "carousel"]), id: z.string(), title: z.string(), revision: z.string().optional(), source_caption: z.string().optional(), scheduled_at: z.string(), captions: z.record(z.string()), account_ids: z.array(z.string()), repeat_accounts: z.array(z.string()).optional() });
const request = z.object({ workspace_id: z.string(), items: z.array(item.omit({ title: true }).extend({ immediate: z.boolean() })), account_ids: z.array(z.string()), request_id: z.string(), confirmed: z.literal(true) });
export const scheduleDraftSchema = z.object({ selected: z.array(z.string()), destinations: z.array(z.string()), day: z.string(), clock: z.string(), startNow: z.boolean(), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }).optional(), excludeWeekends: z.boolean().optional(), cadence: z.enum(["daily", "ai"]).optional(), items: z.array(item).nullable(), assumptions: z.string(), uncertain: z.boolean(), requestId: z.string(), pendingRequest: request.nullable(), savedAt: z.number().optional() });
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export const scheduleDraftKey = (userId: string, workspaceId: string) => `as:schedule-draft:v1:${userId}:${workspaceId}`;
export function readScheduleDraft(userId: string, scope: string, workspaceId = scope): ScheduleDraft | null {
  try { const key = scheduleDraftKey(userId, scope); const value = scheduleDraftSchema.safeParse(JSON.parse(window.localStorage.getItem(key) ?? "null")); if (!value.success || (value.data.pendingRequest && value.data.pendingRequest.workspace_id !== workspaceId) || (value.data.uncertain && !value.data.pendingRequest)) return null; if (!value.data.uncertain && value.data.savedAt && Date.now() - value.data.savedAt > 30 * 86400000) { window.localStorage.removeItem(key); return null; } return value.data; } catch { return null; }
}
export function writeScheduleDraft(userId: string, workspaceId: string, draft: ScheduleDraft): boolean {
  try {
    const key = scheduleDraftKey(userId, workspaceId);
    const stored = scheduleDraftSchema.safeParse(JSON.parse(window.localStorage.getItem(key) ?? "null"));
    if (stored.success && stored.data.uncertain && stored.data.pendingRequest && (!draft.uncertain || JSON.stringify(draft.pendingRequest) !== JSON.stringify(stored.data.pendingRequest))) return false;
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() })); return true;
  } catch { return false; }
}
export function clearScheduleDraft(userId: string, workspaceId: string) { try { window.localStorage.removeItem(scheduleDraftKey(userId, workspaceId)); } catch {} }

