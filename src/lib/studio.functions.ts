import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { decideConfirm, parseBlocks } from "./sam.blocks";
import { resetNarrativeLibrary } from "./narrative-reset.server";

async function assertAccess(userId: string, workspaceId: string) {
  const admin = getAdminClient();
  const { data } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (!data) throw new Error("Forbidden");
  return admin;
}

export type FilePreview = {
  id: string; name: string; kind: string; label: string | null; summary: string | null; folder: string | null;
  text: string | null; url: string | null; thumbnail: string | null; playback: string | null; download: string | null;
};

/** Short-lived preview links for files Sam shows in Live View (this business only). */
export const getFilePreviews = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), file_ids: z.array(z.string().uuid()).max(60) }).parse(i))
  .handler(async ({ data }): Promise<FilePreview[]> => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    if (!data.file_ids.length) return [];
    const { data: rows } = await admin.from("brand_files")
      .select("id,name,kind,ai_label,ai_summary,extracted_text,storage_path,media_id,asset_folders(name)")
      .eq("workspace_id", data.workspace_id).in("id", data.file_ids);
    const { getMedia } = await import("./render.server");
    const out = await Promise.all((rows ?? []).map(async (f): Promise<FilePreview> => {
      let url: string | null = null, thumbnail: string | null = null, playback: string | null = null, download: string | null = null;
      if (f.media_id) {
        try { const m = await getMedia(f.media_id); thumbnail = m.thumbnail_url ?? null; playback = m.playback_url ?? null; download = m.download_url ?? null; } catch { /* still show the card */ }
      } else if (!f.storage_path.startsWith("autotoast:")) {
        const { data: s } = await admin.storage.from("brand-assets-private").createSignedUrl(f.storage_path, 3600);
        url = s?.signedUrl ?? null; download = url;
      }
      return {
        id: f.id, name: f.name, kind: f.kind, label: f.ai_label, summary: f.ai_summary,
        folder: (f as { asset_folders?: { name: string } | null }).asset_folders?.name ?? null,
        text: f.extracted_text ? f.extracted_text.slice(0, 40000) : null, url, thumbnail, playback, download,
      };
    }));
    const order = new Map(data.file_ids.map((id, i) => [id, i]));
    return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  });

/** Library picker for swapping a shot (newest first, images/videos/logos). */
export const listPickableFiles = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertAccess(user.id, data.workspace_id);
    const { data: rows } = await admin.from("brand_files").select("id,name,kind,ai_label")
      .eq("workspace_id", data.workspace_id).in("kind", ["image", "logo", "video", "audio", "doc"]).order("created_at", { ascending: false }).limit(200);
    return rows ?? [];
  });

/** Records the user's answer on a confirm card and posts it into Sam's chat. */
export const respondToConfirm = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    canvas_id: z.string().uuid(), version: z.number().int(), index: z.number().int().min(0),
    decision: z.enum(["approved", "changes", "cancelled"]), note: z.string().max(1000).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: c } = await admin.from("canvases").select("id,workspace_id,module,blocks,version").eq("id", data.canvas_id).single();
    if (!c) throw new Error("Not found");
    await assertAccess(user.id, c.workspace_id);
    const blocks = decideConfirm(parseBlocks(c.blocks), data.index, data.decision);
    const card = blocks[data.index] as Extract<(typeof blocks)[number], { type: "confirm" }>;
    let cleared = 0;
    if (data.decision === "approved" && card.action === "clear_narratives") {
      if (c.module !== "create") throw new Error("Narratives can only be cleared from Create.");
      const result = await resetNarrativeLibrary(admin, c.workspace_id, user.id);
      if (result.failed) throw new Error("Some ideas could not be cleared. Please try Approve again.");
      cleared = result.cleared;
    }
    const upd = await admin.from("canvases").update({ blocks: blocks as never, version: c.version + 1, updated_by: "user", updated_at: new Date().toISOString() })
      .eq("id", c.id).eq("version", c.version).select("id,version,title");
    if (!upd.data?.length) throw new Error("This canvas changed meanwhile — please try again.");
    const words = { approved: "Approved", changes: "Change something", cancelled: "Cancelled" }[data.decision];
    const { data: t } = await admin.from("agent_threads").select("id").eq("workspace_id", c.workspace_id).eq("module", c.module)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (t) await admin.from("agent_messages").insert({ thread_id: t.id, workspace_id: c.workspace_id, role: "user", content: `${words}: ${card.title}${data.note ? ` — ${data.note}` : ""}${card.action === "clear_narratives" && data.decision === "approved" ? ` (${cleared} ideas moved to the bin; existing assets preserved)` : ""}`, canvas_id: c.id });
    return { canvas: upd.data[0]!, action: card.action, variant_ids: data.decision === "approved" ? card.variant_ids ?? [] : [], cleared, workspace_id: c.workspace_id };
  });
