import { getAdminClient } from "./supabase-admin.server";
import { FROM, renderEmail, sendViaSendGrid } from "./email-layout.server";

export const OPENAI_QUOTA_MESSAGE = "AI is temporarily unavailable because the service has run out of credits. Our support team has been notified. You can raise a support request now or try again later.";

type OpenAIErrorBody = { error?: { code?: string; type?: string; message?: string } };

function isQuotaExhausted(status: number, body: OpenAIErrorBody): boolean {
  if (status !== 429) return false;
  const code = body.error?.code?.toLowerCase();
  const type = body.error?.type?.toLowerCase();
  return code === "insufficient_quota" || type === "insufficient_quota";
}

async function notifyAdmins(model: string) {
  try {
    const admin = getAdminClient();
    const date = new Date().toISOString().slice(0, 10);
    const { data: claimed, error: claimError } = await admin
      .from("platform_alert_log")
      .upsert({ alert_type: "openai_quota_exhausted", alert_date: date, details: { model } }, { onConflict: "alert_type,alert_date", ignoreDuplicates: true })
      .select("alert_type").maybeSingle();
    if (claimError || !claimed) return;

    const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
    const ids = new Set((roles ?? []).map((row) => row.user_id));
    const recipients: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data.users.length) break;
      for (const user of data.users) if (ids.has(user.id) && user.email) recipients.push(user.email);
      if (data.users.length < 1000) break;
    }
    if (!recipients.length) recipients.push(FROM.email);

    const email = renderEmail({
      preheader: "OpenAI API quota is exhausted",
      heading: "OpenAI credits exhausted",
      intro: ["AutoSocials received an OpenAI insufficient_quota response. AI features are showing a support message to users until the account has available API credits.", `Model: ${model}`, `Detected: ${new Date().toISOString()}`],
      signOff: false,
    });
    await Promise.all([...new Set(recipients)].map((to) => sendViaSendGrid({ to, subject: "AutoSocials: OpenAI API quota exhausted", ...email, categories: ["system-alert"] })));
  } catch (error) {
    console.error("Could not send OpenAI quota alert to admins", error instanceof Error ? error.message : "unknown error");
  }
}

/** Wrap an OpenAI request, replacing exhausted-quota errors with a stable user-safe response. */
export async function fetchOpenAI(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { trackedGenerationFetch } = await import("./generation-context.server");
  const response = await trackedGenerationFetch(input, init);
  if (response.status !== 429) return response;
  const body = await response.clone().json().catch(() => ({})) as OpenAIErrorBody;
  if (!isQuotaExhausted(response.status, body)) return response;
  const model = typeof init?.body === "string" ? (() => { try { return String((JSON.parse(init.body) as { model?: string }).model ?? "unknown"); } catch { return "unknown"; } })() : "unknown";
  await notifyAdmins(model);
  return Response.json({ error: { message: OPENAI_QUOTA_MESSAGE, type: "service_unavailable", code: "ai_quota_exhausted" } }, { status: 503 });
}

/** Allows users to request help even when the AI provider is unavailable. */
export async function submitOpenAIQuotaSupport(email?: string, userId?: string) {
  const emailBody = renderEmail({
    preheader: "A user needs help with an unavailable AI feature",
    heading: "AI support request",
    intro: [`A user encountered an unavailable AI feature${email ? ` (${email})` : ""}.`, `User ID: ${userId ?? "not supplied"}`, `Received: ${new Date().toISOString()}`],
    signOff: false,
  });
  await sendViaSendGrid({ to: FROM.email, subject: "AutoSocials: AI support request", ...emailBody, categories: ["support"] });
}

