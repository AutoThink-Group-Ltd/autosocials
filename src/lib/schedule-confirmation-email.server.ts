import { renderEmail } from "./email-layout.server";

export type ScheduleEmailItem = { title: string; scheduledAt: string; immediate?: boolean; channels: string[]; imageContentId?: string; mediaKind?: "image" | "video" | "document" };
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Render confirmed posts only. Image content IDs refer to attachments, never private storage URLs. */
export function renderScheduleConfirmation(workspace: string, timezone: string, items: ScheduleEmailItem[], partial = false) {
  const format = (item: ScheduleEmailItem) => `${item.immediate ? "Publishing now · " : ""}${new Intl.DateTimeFormat("en-GB", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(item.scheduledAt))}`;
  const rows = items.map(item => {
    const image = item.imageContentId && /^[a-zA-Z0-9._-]+$/.test(item.imageContentId) ? `<td width="88" valign="top" style="padding:12px;"><img src="cid:${item.imageContentId}" width="72" height="72" alt="" style="display:block;object-fit:contain;border-radius:8px;"></td>` : `<td width="88" valign="top" style="padding:12px;"><div style="width:72px;height:72px;line-height:72px;text-align:center;background:#EEEBE4;border-radius:8px;font:12px Arial;color:#64615B;">${item.mediaKind === "video" ? "Video" : item.mediaKind === "document" ? "PDF" : "Image"}</div></td>`;
    return `<tr>${image}<td valign="top" style="padding:12px;border-bottom:1px solid #E4E1DA;font-family:Arial,sans-serif;"><strong style="font-size:15px;">${escapeHtml(item.title)}</strong><br><span style="font-size:13px;color:#64615B;">${escapeHtml(format(item))} · ${escapeHtml(timezone)}</span><br><span style="font-size:13px;color:#64615B;">${escapeHtml(item.channels.join(" · "))}</span></td></tr>`;
  }).join("");
  const email = renderEmail({ preheader: `${items.length} posts scheduled for ${workspace}`, heading: "Your publishing schedule", intro: [partial ? `Some posts could not be scheduled for ${workspace}. Only the confirmed posts are listed below. Return to AutoSocials to review the remaining posts.` : `Your schedule for ${workspace} has been confirmed. Here is what is planned, in ${timezone}.`], bodyHtml: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E4E1DA;border-radius:12px;">${rows}</table>`, ctaLabel: "View your schedule", ctaUrl: "https://autosocials.com/app/schedule", footerNote: "Publishing is subject to the connected platform accepting each post. Check Publish for delivery status." });
  const textRows = items.map(item => `${item.title}\n${format(item)} · ${timezone}\n${item.channels.join(" · ")}`).join("\n\n");
  return { subject: `Your ${workspace} publishing schedule`, html: email.html, text: `${email.text}\n\n${textRows}` };
}
