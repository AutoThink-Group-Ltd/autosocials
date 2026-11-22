import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { AUTOTOAST_PREFIX, storesOnAutoToast, kindOf, MAX_TEXT_CHARS } from "./brand-files";

const ws = z.object({ workspace_id: z.string().uuid() });

async function assertAccess(userId: string, workspaceId: string) {
  const admin = getAdminClient();
  const { data } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (!data) throw new Error("Forbidden");
  return admin;
}

/** Starts a resumable upload on AutoToast; returns a one-upload browser token (never the API key). */
export const startMediaUpload = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ws.extend({
    filename: z.string().min(1).max(300), content_type: z.string().max(200), size_bytes: z.number().int().positive().max(10 * 1024 ** 3),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertAccess(user.id, data.workspace_id);
    if (!storesOnAutoToast(data.filename)) throw new Error("Only video and audio go to video storage.");
    const { createMediaUpload } = await import("./render.server");
    return createMediaUpload({ workspace_id: data.workspace_id, filename: data.filename, content_type: data.content_type || "application/octet-stream", size_bytes: data.size_bytes });
  });

/** Records an uploaded media file in Brand Assets once all parts are in. */
export const recordMedia = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ws.extend({
    media_id: z.string().min(1).max(100), name: z.string().min(1).max(300), mime: z.string().max(200).nullable(),
    size_bytes: z.number().int().nonnegative(), folder_id: z.string().uuid().nullable(), source: z.string().max(20), content_hash: z.string().max(100).nullable().optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    const { data: saved, error } = await admin.from("brand_files").insert({
      workspace_id: data.workspace_id, folder_id: data.folder_id, name: data.name, kind: kindOf(data.name), mime: data.mime,
      size_bytes: data.size_bytes, storage_path: `${AUTOTOAST_PREFIX}${data.media_id}`, media_id: data.media_id,
      transcript_status: "pending", source: data.source, created_by: user.id, content_hash: data.content_hash ?? null,
    }).select("id").single();
    if (error || !saved) throw new Error(error?.message ?? "The uploaded file could not be recorded.");
    return { ok: true, file_id: saved.id };
  });

/** Fresh playback/download/thumbnail links (they expire, so never stored). */
export const getMediaLinks = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ file_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: f } = await admin.from("brand_files").select("workspace_id,media_id").eq("id", data.file_id).single();
    if (!f?.media_id) throw new Error("Not found");
    await assertAccess(user.id, f.workspace_id);
    const { getMedia } = await import("./render.server");
    const m = await getMedia(f.media_id);
    return { status: m.status, playback_url: m.playback_url, download_url: m.download_url, thumbnail_url: m.thumbnail_url, duration_s: m.duration_s };
  });

/** Pulls finished transcripts into Brand Assets so Sam can read them. */
export const syncTranscripts = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ws.parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    const { data: rows } = await admin.from("brand_files").select("id,media_id").eq("workspace_id", data.workspace_id)
      .not("media_id", "is", null).in("transcript_status", ["pending", "processing"]).limit(20);
    if (!rows?.length) return { updated: 0 };
    const { getMedia, transcriptText } = await import("./render.server");
    let updated = 0;
    for (const r of rows) {
      try {
        const m = await getMedia(r.media_id!);
        if (m.status === "failed") {
          await admin.from("brand_files").update({ transcript_status: "failed" }).eq("id", r.id); updated++; continue;
        }
        if (m.status !== "ready" || m.transcript_status === "pending") continue;
        const text = m.transcript_status === "ready" ? transcriptText(m.transcript)?.slice(0, MAX_TEXT_CHARS) ?? null : null;
        await admin.from("brand_files").update({
          transcript_status: m.transcript_status, duration_s: m.duration_s, size_bytes: m.size_bytes,
          ...(text ? { extracted_text: text, labelled_at: null } : {}),
        }).eq("id", r.id);
        updated++;
      } catch (e) { console.error("[syncTranscripts]", e); }
    }
    return { updated };
  });

/** Permanently deletes media on AutoToast for brand files being removed. */
export const deleteMediaFiles = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ws.extend({ file_ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    const { data: rows } = await admin.from("brand_files").select("media_id").eq("workspace_id", data.workspace_id).in("id", data.file_ids).not("media_id", "is", null);
    const { deleteMedia } = await import("./render.server");
    let deleted = 0;
    for (const r of rows ?? []) { try { await deleteMedia(r.media_id!); deleted++; } catch (e) { console.error("[deleteMedia]", e); } }
    return { deleted };
  });

/** Super Admin: storage and transcript usage across the server. */
export const getStorageUsage = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  const admin = getAdminClient();
  const { data: ok } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (!ok) throw new Error("Forbidden");
  const { getMediaUsage } = await import("./render.server");
  const u = await getMediaUsage();
  return { bytes: u.total_bytes_stored ?? 0, files: u.files ?? 0, minutes: u.minutes_transcribed_this_month ?? 0, limitBytes: 500 * 1024 ** 3, limitMinutes: 1500 };
});

/** Playback link for a finished render stored on AutoToast. */
export const getRenderPlayback = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ws.extend({ media_id: z.string().min(1).max(100) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    const { data: f } = await admin.from("brand_files").select("id").eq("workspace_id", data.workspace_id).eq("media_id", data.media_id).limit(1).maybeSingle();
    if (!f) throw new Error("Not found");
    const { getMedia } = await import("./render.server");
    return { url: (await getMedia(data.media_id)).playback_url };
  });
