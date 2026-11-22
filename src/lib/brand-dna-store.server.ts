import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "./supabase-admin.server";
import type {
  BrandDna,
  DnaEdits,
  BrandDnaView,
  DnaTileKind,
} from "./brand-dna";
import {
  applyDnaEdits,
  describeDnaChanges,
  dnaGuidelines,
  productionDirection,
  mergeDnaOverrides,
  type DnaOverrides,
} from "./brand-dna-revision";

export const DNA_BUCKET = "brand-dna-private";
export const PART_BYTES = 5 * 1024 * 1024;
type Admin = ReturnType<typeof getAdminClient>;
export const dnaDb = (admin: Admin) => admin as unknown as SupabaseClient;
export const isOwnedDnaPath = (path: string, ws: string) =>
  path.startsWith(ws + "/dna/") &&
  !/[\\%]/.test(path) &&
  !Array.from(path).some((c) => c.charCodeAt(0) < 32) &&
  path.split("/").every((p) => !!p && p !== ".." && p !== ".");
type Version = {
  id: string;
  dna: BrandDna;
  guidelines: string;
  overrides: DnaOverrides;
  created_at: string;
};
type State = {
  active_version: string | null;
  candidate_version: string | null;
  confirmed: boolean;
};
async function stateFor(admin: Admin, ws: string): Promise<State | null> {
  const { data, error } = await dnaDb(admin)
    .from("brand_dna_state")
    .select("active_version,candidate_version,confirmed")
    .eq("workspace_id", ws)
    .maybeSingle();
  if (error) throw new Error("Could not read the workspace identity.");
  return data;
}
export async function dnaVersion(
  admin: Admin,
  ws: string,
  id: string,
): Promise<Version> {
  const { data, error } = await dnaDb(admin)
    .from("brand_dna_versions")
    .select("id,dna,guidelines,created_at,overrides")
    .eq("workspace_id", ws)
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("This Brand DNA version is unavailable.");
  return data as Version;
}
/** A specific version always belongs to this workspace. Explicit null pins the legacy path. */
export async function readProductionDna(
  admin: Admin,
  ws: string,
  versionId?: string | null,
  forGeneration = false,
) {
  if (versionId === null) return null;
  const s = versionId ? null : await stateFor(admin, ws);
  const id = versionId ?? s?.active_version;
  if (!id) {
    if (forGeneration && s) {
      const { data, error } = await dnaDb(admin)
        .from("brand_dna_runs")
        .select("id")
        .eq("workspace_id", ws)
        .neq("status", "superseded")
        .limit(1);
      if (error) throw new Error("Could not check Brand DNA progress.");
      if (data?.length)
        throw new Error(
          "Your Brand DNA is being prepared. Keep your brief and open Brand DNA for progress or to retry.",
        );
    }
    return null;
  }
  const { dna } = await dnaVersion(admin, ws, id);
  return { id, dna, guidelines: productionDirection(dna) };
}
export async function pinProductionDna(
  admin: Admin,
  ws: string,
  jobKey: string,
  requested?: string,
) {
  const { data, error } = await dnaDb(admin).rpc("pin_brand_dna", {
    p_workspace: ws,
    p_key: jobKey,
    p_requested: requested ?? null,
  });
  if (error || !data)
    throw new Error("Could not reserve this creation’s brand version.");
  if (!data.ready)
    throw new Error(
      "Brand DNA is still being prepared. Save this brief and check Brand DNA for progress.",
    );
  return readProductionDna(admin, ws, data.id);
}
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "application/json": "json",
  "text/markdown": "md",
  "video/webm": "webm",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
};
export async function saveDnaBytes(
  admin: Admin,
  ws: string,
  bytes: Buffer,
  mime: string,
  _name: string,
) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${ws}/dna/objects/${hash}.${mimeExtensions[mime] ?? "bin"}`;
  await writePrivate(admin, path, bytes, mime);
  return path;
}
async function writePrivate(
  admin: Admin,
  path: string,
  bytes: Buffer,
  mime: string,
) {
  const up = await admin.storage
    .from(DNA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (
    up.error &&
    !["409", "Duplicate"].includes(
      String((up.error as { statusCode?: string }).statusCode),
    ) &&
    !/already exists|duplicate/i.test(up.error.message)
  )
    throw new Error("Could not archive the Brand DNA resource.");
}
export async function readDnaBytes(admin: Admin, ws: string, path: string) {
  if (!isOwnedDnaPath(path, ws)) throw new Error("Invalid Brand DNA resource.");
  const { data, error } = await admin.storage.from(DNA_BUCKET).download(path);
  if (error || !data)
    throw new Error("A saved Brand DNA resource could not be read.");
  return Buffer.from(await data.arrayBuffer());
}
export async function storeDnaVersion(
  admin: Admin,
  ws: string,
  source: BrandDna,
  job?: { id: string; token: string },
  edit?: { expected: string; changes: DnaEdits },
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await stateFor(admin, ws);
    if (edit && s?.active_version !== edit.expected)
      throw new Error("The brand has changed. Refresh before saving.");
    const previous = s?.active_version
      ? await dnaVersion(admin, ws, s.active_version)
      : null;
    const overrides = edit
      ? mergeDnaOverrides(source, previous?.overrides ?? {}, edit.changes)
      : (previous?.overrides ?? {});
    const dna = applyDnaEdits(source, overrides, previous?.dna);
    const id = randomUUID(),
      guidelines = dnaGuidelines(dna);
    const base = `${ws}/dna/versions/${id}/`;
    await Promise.all([
      writePrivate(
        admin,
        base + "brand.json",
        Buffer.from(JSON.stringify(dna, null, 2)),
        "application/json",
      ),
      writePrivate(
        admin,
        base + "brand.md",
        Buffer.from(guidelines),
        "text/markdown",
      ),
    ]);
    const { data, error } = await dnaDb(admin).rpc("save_brand_dna_version", {
      p_workspace: ws,
      p_expected: s?.active_version ?? null,
      p_id: id,
      p_dna: dna,
      p_guidelines: guidelines,
      p_overrides: overrides,
      p_job: job?.id ?? null,
      p_token: job?.token ?? null,
    });
    if (error) throw new Error("Could not activate this Brand DNA version.");
    if (data === "saved") return id;
    await admin.storage
      .from(DNA_BUCKET)
      .remove([base + "brand.json", base + "brand.md"]);
    if (data === "superseded") return null;
    if (edit || data !== "conflict") break;
  }
  throw new Error(
    "The identity changed while saving. Retry with the latest version.",
  );
}
export async function readDnaView(
  admin: Admin,
  ws: string,
  website: string | null,
  canEdit: boolean,
): Promise<BrandDnaView> {
  const [s, run] = await Promise.all([
    stateFor(admin, ws),
    dnaDb(admin)
      .from("brand_dna_runs")
      .select("id,status,phase,error")
      .eq("workspace_id", ws)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (run.error) throw new Error("Could not check Brand DNA progress.");
  const view: BrandDnaView = {
    website,
    canEdit,
    run: run.data as BrandDnaView["run"],
    version: null,
    urls: {},
    tiles: [],
    candidate: null,
    downloads: null,
  };
  if (!s?.active_version) return view;
  const [v, candidate, tiles] = await Promise.all([
    dnaVersion(admin, ws, s.active_version),
    s.candidate_version ? dnaVersion(admin, ws, s.candidate_version) : null,
    dnaDb(admin)
      .from("brand_dna_tiles")
      .select("kind,status,path,error,notes")
      .eq("workspace_id", ws)
      .eq("version_id", s.active_version),
  ]);
  if (tiles.error) throw new Error("Could not read the creative showcase.");
  view.version = {
    id: v.id,
    dna: v.dna,
    confirmed: s.confirmed,
    createdAt: v.created_at,
  };
  if (candidate)
    view.candidate = {
      id: candidate.id,
      differences: describeDnaChanges(v.dna, candidate.dna),
    };
  const paths = new Set<string>();
  for (const a of v.dna.assets) {
    if (a.previewPath && /\.(png|webp|jpe?g|avif)$/i.test(a.previewPath))
      paths.add(a.previewPath);
    if (
      a.path &&
      ((v.dna.sourceKind === "website" &&
        /\.(png|webp|jpe?g|avif)$/i.test(a.path) &&
        !a.previewPath) ||
        (a.kind === "font" &&
          a.reusable &&
          /\.(woff2?|ttf|otf)$/i.test(a.path)))
    )
      paths.add(a.path);
  }
  for (const t of tiles.data ?? [])
    if (t.path && t.status === "ready") paths.add(t.path);
  const base = `${ws}/dna/versions/${v.id}/brand.`;
  paths.add(base + "md");
  paths.add(base + "json");
  const signed = await admin.storage.from(DNA_BUCKET).createSignedUrls(
    [...paths].filter((p) => isOwnedDnaPath(p, ws)),
    3600,
  );
  if (signed.error) throw new Error("Could not open the brand materials.");
  for (const f of signed.data ?? [])
    if (f.path && f.signedUrl) view.urls[f.path] = f.signedUrl;
  if (view.urls[base + "md"] && view.urls[base + "json"])
    view.downloads = {
      markdown: view.urls[base + "md"]!,
      json: view.urls[base + "json"]!,
    };
  view.tiles = (tiles.data ?? []).map((t) => ({
    kind: t.kind as DnaTileKind,
    status: t.status,
    url: view.urls[t.path] ?? null,
    error: t.error,
    notes: t.notes ?? [],
  }));
  return view;
}
