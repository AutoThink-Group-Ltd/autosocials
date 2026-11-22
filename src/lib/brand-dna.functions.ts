import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { editsSchema } from "./brand-dna-revision";
import { hasCustomShowcase, type DnaEdits } from "./brand-dna";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import {
  dnaDb,
  dnaVersion,
  DNA_BUCKET,
  PART_BYTES,
  readDnaView,
  storeDnaVersion,
} from "./brand-dna-store.server";
import { importPartPath, wakeDnaWorker } from "./brand-dna-worker.server";
import { publicBrandWebsite } from "./brand-discovery.server";

const workspace = z.object({ workspaceId: z.string().uuid() });
const version = workspace.extend({ versionId: z.string().uuid() });
async function requireDnaWorkspace(ws: string) {
  const user = await requireUser(),
    admin = getAdminClient();
  const { data: allowed, error } = await admin.rpc("can_access_workspace", {
    _user_id: user.id,
    _workspace_id: ws,
  });
  if (error || !allowed) throw new Error("Workspace access denied.");
  return { admin, user };
}
async function access(ws: string, write = false) {
  const { admin, user } = await requireDnaWorkspace(ws);
  const [workspaceRow, member, agency, agencyOwner, staffRole, owner] =
    await Promise.all([
      admin.from("workspaces").select("website").eq("id", ws).single(),
      admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", ws)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("agency_client_links")
        .select("id")
        .eq("workspace_id", ws)
        .eq("agency_user_id", user.id)
        .eq("status", "active")
        .limit(1),
      admin.rpc("agency_staff_owner", { _user_id: user.id }),
      admin.rpc("agency_staff_role", { _user_id: user.id }),
      admin.rpc("is_workspace_owner", { _workspace_id: ws, _user_id: user.id }),
    ]);
  if (workspaceRow.error || !workspaceRow.data)
    throw new Error("Workspace unavailable.");
  let canEdit =
    owner.data === true ||
    member.data?.role === "admin" ||
    !!agency.data?.length;
  if (
    !canEdit &&
    agencyOwner.data &&
    ["owner", "admin"].includes(String(staffRole.data))
  ) {
    const linked = await admin
      .from("agency_client_links")
      .select("id")
      .eq("workspace_id", ws)
      .eq("agency_user_id", agencyOwner.data)
      .eq("status", "active")
      .limit(1);
    canEdit = !linked.error && !!linked.data?.length;
  }
  if (write && !canEdit)
    throw new Error("Only workspace managers can change Brand DNA.");
  return { admin, user, website: workspaceRow.data.website, canEdit };
}
export const getCreativeDnaKit = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    workspace
      .extend({
        jobId: z.string().uuid().optional(),
        format: z.enum(["tile", "carousel"]),
        versionId: z.string().uuid().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { admin } = await access(data.workspaceId);
    const { pinProductionDna, readProductionDna } =
      await import("./brand-dna-store.server");
    const identity = data.jobId
      ? await pinProductionDna(
          admin,
          data.workspaceId,
          `canvas-${data.format}:${data.jobId}`,
          data.versionId,
        )
      : await readProductionDna(admin, data.workspaceId, data.versionId);
    return (await import("./brand-dna-creative.server")).canvasDna(
      admin,
      data.workspaceId,
      identity,
      data.format,
    );
  });
export const getBrandDna = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => workspace.parse(v))
  .handler(async ({ data }) => {
    const a = await access(data.workspaceId);
    return readDnaView(a.admin, data.workspaceId, a.website, a.canEdit);
  });
export const getBrandDnaProgress = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => workspace.parse(v))
  .handler(async ({ data: { workspaceId } }) => {
    const { admin } = await requireDnaWorkspace(workspaceId);
    const db = dnaDb(admin);
    const [run, state] = await Promise.all([
      db
        .from("brand_dna_runs")
        .select("id,status,phase")
        .eq("workspace_id", workspaceId)
        .neq("status", "superseded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("brand_dna_state")
        .select("active_version,candidate_version,confirmed")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);
    if (run.error || state.error)
      throw new Error("Could not read Brand DNA progress.");
    if (!run.data) return null;
    const building =
      run.data.status === "queued" || run.data.status === "running";
    const hasReview =
      !!state.data?.candidate_version ||
      (!!state.data?.active_version && !state.data.confirmed);
    if (building)
      return {
        id: run.data.id,
        status: "building" as const,
        phase: run.data.phase,
      };
    if (run.data.status === "failed")
      return { id: run.data.id, status: "failed" as const };
    if (run.data.status === "complete" && hasReview)
      return { id: run.data.id, status: "ready" as const };
    return null;
  });
export const rebuildBrandDna = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    workspace
      .extend({ website: z.string().trim().min(1).max(1600).optional() })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const ws = data.workspaceId,
      { admin, website } = await access(ws, true),
      db = dnaDb(admin);
    const previous = await db
      .from("brand_dna_runs")
      .select("source_kind,source")
      .eq("workspace_id", ws)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous.error) throw new Error("Could not check the last run.");
    const repeatImport =
      !data.website && previous.data?.source_kind === "package";
    const url = publicBrandWebsite(data.website ?? website);
    if (!repeatImport && (!url || new URL(url).port))
      throw new Error("Enter a public HTTPS website.");
    if (data.website && url !== website) {
      const saved = await admin
        .from("workspaces")
        .update({ website: url! })
        .eq("id", ws);
      if (saved.error) throw new Error("Could not save the workspace website.");
    } else {
      const result = await db.rpc("enqueue_brand_dna", {
        p_workspace: ws,
        p_kind: repeatImport ? "package" : "website",
        p_source: repeatImport ? previous.data!.source : url,
      });
      if (result.error) throw new Error("Could not queue the analysis.");
    }
    wakeDnaWorker(ws);
    return { ok: true };
  });
export const prepareBrandDnaImport = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    workspace
      .extend({
        bytes: z
          .number()
          .int()
          .min(1)
          .max(100 * 1024 ** 2),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { admin, user } = await access(data.workspaceId, true);
    const created = await dnaDb(admin)
      .from("brand_dna_imports")
      .insert({
        workspace_id: data.workspaceId,
        user_id: user.id,
        bytes: data.bytes,
      })
      .select("id")
      .single();
    if (created.error || !created.data)
      throw new Error("Could not prepare the private upload.");
    const id = String(created.data.id);
    const parts = await Promise.all(
      Array.from(
        { length: Math.ceil(data.bytes / PART_BYTES) },
        async (_, i) => {
          const path = importPartPath(data.workspaceId, id, i),
            result = await admin.storage
              .from(DNA_BUCKET)
              .createSignedUploadUrl(path, { upsert: false });
          if (result.error || !result.data)
            throw new Error("Could not prepare an upload part.");
          return { path, token: result.data.token };
        },
      ),
    );
    return { objectPath: id, partBytes: PART_BYTES, parts };
  });
export const importBrandDna = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    workspace.extend({ objectPath: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data }) => {
    const { admin, user } = await access(data.workspaceId, true),
      db = dnaDb(admin);
    const record = await db
      .from("brand_dna_imports")
      .select("id")
      .eq("id", data.objectPath)
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (record.error || !record.data)
      throw new Error("The upload does not belong to this workspace and user.");
    const result = await db.rpc("enqueue_brand_dna", {
      p_workspace: data.workspaceId,
      p_kind: "package",
      p_source: data.objectPath,
    });
    if (result.error) throw new Error("Could not queue the package import.");
    wakeDnaWorker(data.workspaceId);
    return { ok: true };
  });
export const editBrandDna = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    version
      .extend({
        changes: editsSchema.optional(),
        confirm: z.boolean().optional(),
      })
      .refine(
        (v) => !!v.confirm !== !!v.changes,
        "Choose a correction or confirmation.",
      )
      .parse(v),
  )
  .handler(async ({ data }) => {
    const ws = data.workspaceId,
      { admin } = await access(ws, true);
    if (data.confirm) {
      const result = await dnaDb(admin)
        .from("brand_dna_state")
        .update({ confirmed: true })
        .eq("workspace_id", ws)
        .eq("active_version", data.versionId)
        .select("workspace_id")
        .maybeSingle();
      if (result.error || !result.data)
        throw new Error("The identity changed. Refresh before confirming.");
    } else {
      const before = await dnaVersion(admin, ws, data.versionId);
      await storeDnaVersion(admin, ws, before.dna, undefined, {
        expected: before.id,
        changes: data.changes as DnaEdits,
      });
      wakeDnaWorker(ws);
    }
    return { ok: true };
  });
export const adoptBrandDna = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    version.extend({ candidateId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data }) => {
    const { admin } = await access(data.workspaceId, true);
    const result = await dnaDb(admin).rpc("adopt_brand_dna_version", {
      p_workspace: data.workspaceId,
      p_expected: data.versionId,
      p_candidate: data.candidateId,
    });
    if (result.error || !result.data)
      throw new Error(
        "A newer version is available. Review the changes again.",
      );
    wakeDnaWorker(data.workspaceId);
    return { ok: true };
  });
export const retryBrandDnaTiles = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    version
      .extend({
        kind: z.enum(["product", "promotional", "educational"]).optional(),
        refreshDesign: z.literal(true).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { admin } = await access(data.workspaceId, true),
      db = dnaDb(admin);
    const state = await db
      .from("brand_dna_state")
      .select("active_version")
      .eq("workspace_id", data.workspaceId)
      .single();
    if (state.error || state.data?.active_version !== data.versionId)
      throw new Error("This version is no longer active.");
    if (data.refreshDesign) {
      const { dna } = await dnaVersion(admin, data.workspaceId, data.versionId);
      if (!hasCustomShowcase(dna))
        throw new Error(
          "The refreshed showcase design is not available for this brand.",
        );
    }
    let query = db
      .from("brand_dna_tiles")
      .update({ status: "queued", error: null })
      .eq("workspace_id", data.workspaceId)
      .eq("version_id", data.versionId)
      .in("status", data.refreshDesign ? ["failed", "ready"] : ["failed"]);
    if (data.kind) query = query.eq("kind", data.kind);
    if ((await query).error)
      throw new Error("Could not queue the showcase example.");
    wakeDnaWorker(data.workspaceId);
    return { ok: true };
  });
