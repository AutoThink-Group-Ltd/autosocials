import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const request = z.object({ kind: z.enum(["video", "tile"]), workspaceId: z.string().uuid(), target: z.string().min(1).max(300) }).strict();
async function adminForCaller() {
  const { requireUser, getAdminClient } = await import("./supabase-admin.server");
  const user = await requireUser();
  const admin = getAdminClient() as any;
  const role = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (role.error || role.data !== true) throw new Error("Forbidden");
  return { admin, user };
}

export const enqueueAdminContentDeletions = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ confirmed: z.literal(true), items: z.array(request).min(1).max(50) }).strict().parse(v))
  .handler(async ({ data }) => {
    const { admin, user } = await adminForCaller();
    const outcomes: { target: string; workspaceId: string; error?: string }[] = [];
    for (const item of data.items) {
      const r = await admin.rpc("enqueue_admin_content_deletion", { p_actor: user.id, p_kind: item.kind, p_workspace: item.workspaceId, p_target: item.target });
      outcomes.push(r.error ? { target: item.target, workspaceId: item.workspaceId, error: r.error.message } : { target: item.target, workspaceId: item.workspaceId });
    }
    return outcomes;
  });

/** Retry durable requests when an admin asks. Storage is removed before DB records. */
export const processAdminContentDeletions = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ kind: z.enum(["video", "tile"]) }).strict().parse(v))
  .handler(async ({ data }) => {
    const { admin } = await adminForCaller();
    let completed = 0;
    const attempted: string[] = [];
    for (let count = 0; count < 50; count++) {
      const claim = await admin.rpc("claim_admin_content_deletion", { p_kind: data.kind, p_exclude: attempted });
      if (claim.error) throw new Error("Deletion queue is unavailable.");
      const item = Array.isArray(claim.data) ? claim.data[0] : claim.data;
      if (!item?.id) break;
      attempted.push(item.id);
      try {
        const path: string | null = item.storage_path;
        if (path?.startsWith("autotoast:")) {
          const id = path.slice(10);
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid stored media reference.");
          const { getMedia, deleteMedia } = await import("./render.server");
          let absent = false;
          try {
            const media = await getMedia(id);
            if (!(media.workspace_id === item.workspace_id || (media.kind === "render" && !!item.provider_job_id && media.render_job_id === item.provider_job_id))) throw new Error("Media ownership could not be verified.");
            const verified = await admin.from("admin_content_deletions").update({ provider_verified: true }).eq("id", item.id).eq("state", "pending").eq("claim_token", item.claim_token).select("id").maybeSingle();
            if (verified.error || !verified.data) throw new Error("Could not save media verification.");
          } catch (error) {
            if (item.provider_verified && error instanceof Error && error.message.includes("(404)")) absent = true;
            else throw error;
          }
          if (!absent) await deleteMedia(id);
        } else if (path) {
          const { adminContentOwnedPath } = await import("./admin-content.server");
          if (!adminContentOwnedPath(path, item.workspace_id)) throw new Error("Invalid stored media path.");
          const removed = await admin.storage.from("brand-assets-private").remove([path]);
          if (removed.error) throw new Error("Storage deletion failed.");
        }
        const finished = await admin.rpc("finish_admin_content_deletion", { p_id: item.id, p_claim: item.claim_token });
        if (finished.error) throw new Error("Database cleanup failed.");
        completed++;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "Deletion failed.";
        await admin.from("admin_content_deletions").update({ last_error: message, claim_token: null, claimed_at: null }).eq("id", item.id).eq("state", "pending").eq("claim_token", item.claim_token);
      }
    }
    const remaining = await admin.from("admin_content_deletions").select("id", { count: "exact", head: true }).eq("state", "pending").eq("kind", data.kind);
    if (remaining.error) throw new Error("Deletion status is unavailable. Retry pending deletions.");
    return { completed, pending: remaining.count ?? 0 };
  });
