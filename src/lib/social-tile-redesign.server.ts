import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialDesign, QuoteEvidence } from "./social-design";
import type { TileProvider } from "./social-tile-routing";
import { tileRequestUuid } from "./social-tile-run";
import { getAdminClient } from "./supabase-admin.server";
import { createSamTile } from "./sam-tile-design.server";
import { readSocialTileImage } from "./social-tile-image.server";

type Request = {
  workspace_id: string;
  original_request_id: string;
  expected_file_id: string;
  headline: string;
  supporting: string;
  direction: string;
  design?: SocialDesign | undefined;
  standalone?: true | undefined;
  quote?: QuoteEvidence | undefined;
  expected_provider: TileProvider;
  expected_credits: number;
  expected_rate_id: string;
};

export async function redesignTile(user: string, request: Request) {
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: user, _workspace_id: request.workspace_id });
  if (access.error || !access.data) throw new Error("You don't have access to this workspace.");
  const db = admin as unknown as SupabaseClient;
  const signature = createHash("sha256").update(JSON.stringify({ request_id: request.original_request_id })).digest("hex");
  const requestId = tileRequestUuid(createHash("sha256").update(`as:tile-redesign:${request.workspace_id}:${request.original_request_id}:${request.expected_file_id}`).digest());
  const current = await db.from("brand_work_operations").select("status,result").eq("workspace_id", request.workspace_id).eq("kind", "postcard-social-tile").eq("signature", signature).maybeSingle();
  if (!current.error && current.data?.status === "complete" && current.data.result?.file_id === requestId)
    return { status: "ready" as const, ...await readSocialTileImage(user, request.workspace_id, requestId) };
  if (current.error || current.data?.status !== "complete" || current.data.result?.file_id !== request.expected_file_id)
    throw new Error("This tile has changed. Check its status before redesigning it.");
  const { original_request_id: _original, expected_file_id: _file, ...input } = request;
  const result = await createSamTile(user, { ...input, request_id: requestId, retry_safe: "before_generation" });
  if (result.status !== "ready") return result;
  const { artwork_file_id: _artwork, ...previous } = current.data.result;
  const updated = await db.from("brand_work_operations")
    .update({ result: { ...previous, file_id: requestId, superseded_file_ids: [...new Set([...(Array.isArray(previous.superseded_file_ids) ? previous.superseded_file_ids.filter((id: unknown) => typeof id === "string") : []), request.expected_file_id])], ...("artwork_file_id" in result && result.artwork_file_id ? { artwork_file_id: result.artwork_file_id } : {}) } })
    .eq("workspace_id", request.workspace_id).eq("kind", "postcard-social-tile")
    .eq("signature", signature).eq("status", "complete")
    .eq("result->>file_id", request.expected_file_id).select("result").maybeSingle();
  if (updated.error) throw new Error("The redesign was saved but its tile could not be updated. Check its status.");
  if (!updated.data) {
    const latest = await db.from("brand_work_operations").select("result").eq("workspace_id", request.workspace_id).eq("kind", "postcard-social-tile").eq("signature", signature).maybeSingle();
    if (latest.error || latest.data?.result?.file_id !== requestId)
      throw new Error("The tile changed while the redesign was being saved. Check its status.");
  }
  return result;
}

export async function listSupersededTiles(user: string, workspaceId: string) {
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: user, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You don't have access to this workspace.");
  const db = admin as unknown as SupabaseClient;
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const rows = await db.from("brand_work_operations").select("superseded:result->superseded_file_ids").eq("workspace_id", workspaceId).eq("kind", "postcard-social-tile").eq("status", "complete").not("result->superseded_file_ids", "is", null).order("signature").range(offset, offset + 999);
    if (rows.error) throw new Error("Could not check replaced tile designs.");
    for (const row of rows.data ?? [])
      if (Array.isArray(row.superseded))
        for (const id of row.superseded) if (typeof id === "string") ids.add(id);
    if ((rows.data?.length ?? 0) < 1000) break;
  }
  return [...ids];
}
