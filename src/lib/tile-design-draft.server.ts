import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { getAdminClient } from "./supabase-admin.server";
import { readSocialTileImage } from "./social-tile-image.server";
import {
  tileDesignDraftPayload,
  type saveTileDesignInput,
} from "./tile-design-draft";

type Admin = ReturnType<typeof getAdminClient>;
const KIND = "tile-design-draft-v1";

async function member(admin: Admin, userId: string, workspaceId: string) {
  const access = await admin.rpc("can_access_workspace", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });
  if (access.error || !access.data) throw new Error("Workspace access denied.");
}

export async function saveTileDesignForUser(
  userId: string,
  input: z.infer<typeof saveTileDesignInput>,
) {
  const admin = getAdminClient();
  await member(admin, userId, input.workspace_id);
  const db = admin as unknown as SupabaseClient;
  const token = crypto.randomUUID();
  const key = {
    workspace_id: input.workspace_id,
    kind: KIND,
    signature: input.id,
  };
  if (!input.version) {
    const row = await db
      .from("brand_work_operations")
      .insert({ ...key, token, status: "complete", result: input.payload })
      .select("token")
      .maybeSingle();
    if (row.error || !row.data)
      throw new Error(
        "This design could not be created. Reopen it before trying again.",
      );
    return { id: input.id, version: row.data.token as string };
  }
  // The token is an opaque revision. Its atomic comparison prevents concurrent overwrite.
  const saved = await db
    .from("brand_work_operations")
    .update({
      token,
      result: input.payload,
      updated_at: new Date().toISOString(),
    })
    .match(key)
    .eq("status", "complete")
    .eq("token", input.version)
    .select("token")
    .maybeSingle();
  if (saved.error || !saved.data)
    throw new Error("This design changed elsewhere. Reopen it before saving.");
  return { id: input.id, version: saved.data.token as string };
}

export async function getTileDesignForUser(
  userId: string,
  workspaceId: string,
  id: string,
) {
  const admin = getAdminClient();
  await member(admin, userId, workspaceId);
  const db = admin as unknown as SupabaseClient;
  const row = await db
    .from("brand_work_operations")
    .select("token,result")
    .eq("workspace_id", workspaceId)
    .eq("kind", KIND)
    .eq("signature", id)
    .eq("status", "complete")
    .maybeSingle();
  if (row.error || !row.data)
    throw new Error("This tile design is unavailable.");
  return {
    id,
    version: row.data.token as string,
    ...tileDesignDraftPayload.parse(row.data.result),
  };
}

export async function listTileDesignsForUser(
  userId: string,
  workspaceId: string,
) {
  const admin = getAdminClient();
  await member(admin, userId, workspaceId);
  const db = admin as unknown as SupabaseClient;
  const rows = await db
    .from("brand_work_operations")
    .select("signature,result")
    .eq("workspace_id", workspaceId)
    .eq("kind", KIND)
    .eq("status", "complete")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (rows.error) throw new Error("Could not load tile designs.");
  return (rows.data ?? []).flatMap((row) => {
    const payload = tileDesignDraftPayload.safeParse(row.result);
    return payload.success
      ? [
          {
            id: row.signature as string,
            name: payload.data.plan.tiles[0]!.headline,
          },
        ]
      : [];
  });
}

export async function getDesignLogoForUser(
  userId: string,
  workspaceId: string,
): Promise<string | undefined> {
  const admin = getAdminClient();
  await member(admin, userId, workspaceId);
  const rows = await admin
    .from("brand_files")
    .select("id,storage_path,size_bytes")
    .eq("workspace_id", workspaceId)
    .eq("kind", "logo")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (rows.error) throw new Error("Could not load the brand logo.");
  for (const file of rows.data ?? []) {
    if (
      !file.storage_path?.startsWith(`${workspaceId}/`) ||
      file.storage_path.includes("\\") ||
      file.storage_path
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      (file.size_bytes ?? 0) > 8 * 1024 * 1024
    )
      continue;
    try {
      const image = await readSocialTileImage(userId, workspaceId, file.id);
      if (image.kind === "logo") return image.data_url;
    } catch {
      /* Skip unavailable or malformed assets. */
    }
  }
  return undefined;
}
