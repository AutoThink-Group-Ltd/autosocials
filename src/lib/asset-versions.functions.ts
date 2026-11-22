import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { assetWithSnapshot, hasBriefSnapshot, renderLinks, resolvePrimaryRender, snapshotForRender } from "./asset-versions.server";
import type { RenderRow } from "./asset-versions.server";

const AssetId = z.object({ id: z.string().uuid() });
const VersionId = AssetId.extend({ render_id: z.string().uuid() });

async function accessibleAsset(id: string) {
  const user = await requireUser();
  const admin = getAdminClient();
  const resolved = await resolvePrimaryRender(admin, id);
  if (!resolved) throw new Error("Asset not found.");
  const { data: allowed, error } = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: resolved.asset.workspace_id });
  if (error || !allowed) throw new Error("You don't have access to this asset.");
  return { admin, user, ...resolved };
}

export const getAssetVersions = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => AssetId.parse(input))
  .handler(async ({ data }) => {
    const { admin, asset, render: primary, brief } = await accessibleAsset(data.id);
    const rows: RenderRow[] = [];
    for (let offset = 0; ; offset += 200) {
      const { data: page, error } = await admin.from("render_jobs").select("*").eq("variant_id", asset.id).eq("workspace_id", asset.workspace_id).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 199);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if ((page?.length ?? 0) < 200) break;
    }
    return {
      asset: { id: asset.id, workspace_id: asset.workspace_id, hook: brief.hook, size: brief.size, duration_s: brief.duration_s, review_state: brief.review_state, version: asset.version, primary_render_id: primary?.id ?? null },
      versions: rows.map((row) => {
        const snapshot = snapshotForRender(asset, row);
        const version = assetWithSnapshot(asset, snapshot);
        return { id: row.id, version: row.version ?? 1, status: row.status, phase: row.phase, progress: row.progress, error: row.error, created_at: row.created_at, started_at: row.started_at, revision_note: row.revision_note, is_primary: row.id === primary?.id, has_snapshot: hasBriefSnapshot(snapshot), hook: version.hook, size: version.size, duration_s: version.duration_s };
      }),
    };
  });

export const getPrimaryAssetPlayback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssetId.parse(input))
  .handler(async ({ data }) => {
    const { admin, render, brief } = await accessibleAsset(data.id);
    if (!render) throw new Error("Video preview unavailable.");
    const { url } = await renderLinks(admin, render, brief.hook);
    return { url };
  });

export const getAssetVersionPlayback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VersionId.parse(input))
  .handler(async ({ data }) => {
    const { admin, asset } = await accessibleAsset(data.id);
    const { data: render, error } = await admin.from("render_jobs").select("*").eq("id", data.render_id).eq("variant_id", asset.id).eq("workspace_id", asset.workspace_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!render) throw new Error("Version not found.");
    const brief = assetWithSnapshot(asset, snapshotForRender(asset, render));
    return renderLinks(admin, render, brief.hook);
  });

export const setPrimaryAssetVersion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VersionId.parse(input))
  .handler(async ({ data }) => {
    const { admin, asset, user } = await accessibleAsset(data.id);
    const saved = await admin.rpc("set_primary_asset_render", { _variant_id: asset.id, _render_id: data.render_id, _user_id: user.id });
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true };
  });
