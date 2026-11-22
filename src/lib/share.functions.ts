import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { shareEmailContent, SHARE_ORIGIN } from "./share";
import { renderLinks, resolvePrimaryRender } from "./asset-versions.server";

type Admin = ReturnType<typeof getAdminClient>;

async function assertAccess(admin: Admin, userId: string, ws: string) {
  const { data } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: ws });
  if (!data) throw new Error("You don't have access to this workspace.");
}

/** The user's chosen primary version supplies every shared/downloaded video. */
async function videoLinks(admin: Admin, variantIds: string[], download: boolean) {
  const out: { id: string; hook: string; size: string; duration_s: number; url: string | null }[] = [];
  for (const vid of variantIds) {
    const primary = await resolvePrimaryRender(admin, vid);
    if (!primary) continue;
    const { brief: v, render } = primary;
    const links = render ? await renderLinks(admin, render, v.hook).catch(() => null) : null;
    out.push({ id: v.id, hook: v.hook, size: v.size, duration_s: v.duration_s, url: download ? links?.download_url ?? null : links?.url ?? null });
  }
  return out;
}

/** Download the original MP4 Sam made (any finished asset the caller can access). */
export const downloadVideo = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("workspace_id").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertAccess(admin, user.id, v.workspace_id);
    const [link] = await videoLinks(admin, [data.id], true);
    if (!link?.url) throw new Error("This video isn't finished yet.");
    return { url: link.url };
  });

/** Create (or reuse) a public share link for one or more finished videos. */
export const createShare = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), variant_ids: z.array(z.string().uuid()).min(1).max(12) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    await assertAccess(admin, user.id, data.workspace_id);
    const { data: vs } = await admin.from("creative_variants").select("id").eq("workspace_id", data.workspace_id).in("id", data.variant_ids);
    const ids = (vs ?? []).map((v) => v.id);
    if (!ids.length) throw new Error("Nothing to share.");
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const { error } = await admin.from("video_shares").insert({ token, workspace_id: data.workspace_id, variant_ids: ids, created_by: user.id });
    if (error) throw new Error(error.message);
    return { token, url: `${SHARE_ORIGIN}/s/${token}` };
  });

export const revokeShare = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: s } = await admin.from("video_shares").select("workspace_id").eq("token", data.token).maybeSingle();
    if (!s) throw new Error("Not found");
    await assertAccess(admin, user.id, s.workspace_id);
    await admin.from("video_shares").update({ revoked: true }).eq("token", data.token);
    return { ok: true };
  });

async function senderInfo(admin: Admin, userId: string, ws: string) {
  const [{ data: p }, { data: w }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    admin.from("workspaces").select("name").eq("id", ws).maybeSingle(),
  ]);
  return { sender: p?.full_name || "A colleague", brand: w?.name || "your brand" };
}

const EmailIn = z.object({ token: z.string().min(8).max(40), to: z.string().email().max(200), note: z.string().max(600).optional() });

/** Server-rendered preview of the exact email the colleague receives. */
export const previewShareEmail = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => EmailIn.extend({ to: z.string().max(200) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: s } = await admin.from("video_shares").select("workspace_id,variant_ids").eq("token", data.token).maybeSingle();
    if (!s) throw new Error("Not found");
    await assertAccess(admin, user.id, s.workspace_id);
    const info = await senderInfo(admin, user.id, s.workspace_id);
    const { renderEmail } = await import("./email-layout.server");
    const c = shareEmailContent({ ...info, count: s.variant_ids.length, note: data.note, url: `${SHARE_ORIGIN}/s/${data.token}` });
    return { subject: c.subject, html: renderEmail(c.email).html };
  });

export const sendShareEmail = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => EmailIn.parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: s } = await admin.from("video_shares").select("workspace_id,variant_ids,revoked").eq("token", data.token).maybeSingle();
    if (!s || s.revoked) throw new Error("This link is no longer active.");
    await assertAccess(admin, user.id, s.workspace_id);
    const info = await senderInfo(admin, user.id, s.workspace_id);
    const { renderEmail, sendViaSendGrid } = await import("./email-layout.server");
    const c = shareEmailContent({ ...info, count: s.variant_ids.length, note: data.note, url: `${SHARE_ORIGIN}/s/${data.token}` });
    const r = renderEmail(c.email);
    await sendViaSendGrid({ to: data.to, subject: c.subject, html: r.html, text: r.text, categories: ["video-share"] });
    return { ok: true };
  });

/** Public: the videos behind a share link. Returns nothing for revoked/unknown tokens. */
export const getSharedVideos = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const { data: s } = await admin.from("video_shares").select("workspace_id,variant_ids,revoked").eq("token", data.token).maybeSingle();
    if (!s || s.revoked) return null;
    const { data: w } = await admin.from("workspaces").select("name").eq("id", s.workspace_id).maybeSingle();
    const play = await videoLinks(admin, s.variant_ids, false);
    const dl = await videoLinks(admin, s.variant_ids, true);
    return { brand: w?.name ?? "AutoSocials", videos: play.map((p, i) => ({ ...p, download: dl[i]?.url ?? null })) };
  });
