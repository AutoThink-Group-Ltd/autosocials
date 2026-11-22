import { getAdminClient } from "./supabase-admin.server";

/** Store only a coarse category: raw provider errors may contain credentials or user content. */
export function scheduleFailureCategory(error: unknown): "access" | "account" | "approval" | "media" | "timing" | "provider" | "other" {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/access denied|forbidden|unauthori[sz]ed/.test(message)) return "access";
  if (/approval|approved/.test(message)) return "approval";
  if (/account|channel|connect/.test(message)) return "account";
  if (/media|image|video|tile|draft|render/.test(message)) return "media";
  if (/time|date|schedule.*ahead/.test(message)) return "timing";
  if (/provider|facebook|instagram/.test(message)) return "provider";
  return "other";
}

export async function recordCreationScheduleFailure(event: { workspaceId: string; requestId: string; actorId: string; stage: "prepare" | "confirm" | "delivery"; creationType?: "tile" | "video"; creationId?: string; error: unknown }): Promise<void> {
  const admin = getAdminClient();
  const category = scheduleFailureCategory(event.error);
  const { error } = await (admin.from("creation_schedule_failure_events" as never) as any).insert({ workspace_id: event.workspaceId, request_id: event.requestId, actor_id: event.actorId, stage: event.stage, creation_type: event.creationType ?? null, creation_id: event.creationId ?? null, category });
  if (error) console.error("Could not record creation schedule failure", { stage: event.stage });
  try {
    // One alert per day and category prevents repeated retries flooding administrators.
    const { data: claim, error: claimError } = await admin.from("platform_alert_log").upsert({ alert_type: `schedule_failure_${category}`, alert_date: new Date().toISOString().slice(0, 10), details: { stage: event.stage, category } }, { onConflict: "alert_type,alert_date", ignoreDuplicates: true }).select("alert_type").maybeSingle();
    if (claimError || !claim) return;
    const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
    const ids = new Set((roles ?? []).map(role => role.user_id));
    const recipients = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      const { data, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (usersError || !data.users.length) break;
      for (const user of data.users) if (ids.has(user.id) && user.email) recipients.add(user.email);
      if (data.users.length < 1000) break;
    }
    const { FROM, renderEmail, sendViaSendGrid } = await import("./email-layout.server");
    if (!recipients.size) recipients.add(FROM.email);
    const email = renderEmail({ preheader: "A publishing schedule needs attention", heading: "Scheduling needs attention", intro: [`A ${category} error occurred while a schedule was being confirmed. Review the scheduling failure alerts in the admin generation tracker.`], ctaLabel: "Review alerts", ctaUrl: "https://autosocials.com/app/admin/generations", signOff: false });
    await Promise.all([...recipients].map(to => sendViaSendGrid({ to, subject: "AutoSocials: scheduling needs attention", ...email, categories: ["system-alert"] })));
  } catch { console.error("Could not send scheduling failure alert", { stage: event.stage }); }
}
