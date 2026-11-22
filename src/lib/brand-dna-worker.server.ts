import { getAdminClient } from "./supabase-admin.server";
import {
  dnaDb,
  dnaVersion,
  DNA_BUCKET,
  PART_BYTES,
  readDnaBytes,
  saveDnaBytes,
  storeDnaVersion,
} from "./brand-dna-store.server";
import type { DnaTileKind } from "./brand-dna";
import { publicBrandWebsite } from "./brand-discovery.server";
import { waitUntil } from "@vercel/functions";

type Admin = ReturnType<typeof getAdminClient>;
type Job = {
  id: string;
  workspace_id: string;
  token: string;
  source_kind: "website" | "package";
  source: string;
  version_id: string;
  kind: DnaTileKind;
};
export const importPartPath = (ws: string, id: string, index: number) =>
  `${ws}/dna/imports/${id}/part-${index}`;
async function readImport(admin: Admin, ws: string, id: string) {
  const { data, error } = await dnaDb(admin)
    .from("brand_dna_imports")
    .select("bytes")
    .eq("workspace_id", ws)
    .eq("id", id)
    .single();
  if (error || !data)
    throw new Error("The upload could not be found. Upload the package again.");
  const parts: Buffer[] = [];
  for (let i = 0; i < Math.ceil(data.bytes / PART_BYTES); i++) {
    const b = await readDnaBytes(admin, ws, importPartPath(ws, id, i));
    if (b.length !== Math.min(PART_BYTES, data.bytes - i * PART_BYTES))
      throw new Error(
        "The package upload is incomplete. Upload the package again.",
      );
    parts.push(b);
  }
  return Buffer.concat(parts, data.bytes);
}
async function illustrativeArtwork(
  admin: Admin,
  job: Job,
  generate: () => Promise<Buffer>,
) {
  const path = `${job.workspace_id}/dna/showcase/${job.version_id}/${job.kind}-illustration.png`;
  const db = dnaDb(admin),
    usage = db.from("brand_dna_artwork_usage");
  if (!process.env["OPENAI_API_KEY"]?.trim())
    throw new Error("Illustration generation is not configured.");
  const reserved = await usage.insert({
    tile_id: job.id,
    path,
    model: "gpt-image-2.5-flare",
  });
  if (reserved.error && reserved.error.code !== "23505")
    throw new Error("Could not reserve showcase illustration.");
  if (reserved.error) {
    // Reuse the saved object first, even if its reservation was never marked stored.
    const { data, error } = await admin.storage.from(DNA_BUCKET).download(path);
    if (data) return Buffer.from(await data.arrayBuffer());
    const existing = await usage
      .select("status")
      .eq("tile_id", job.id)
      .single();
    const status =
      "statusCode" in (error ?? {})
        ? String((error as { statusCode?: string }).statusCode)
        : "";
    if (
      !existing.error &&
      existing.data?.status === "uncertain" &&
      /^(?:404|NoSuchKey|NotFound)$/i.test(status)
    ) {
      // The result is uncertain and no file exists. Produce a text-led example
      // without spending again or altering the original reservation.
      return undefined;
    }
    throw new Error(
      "Illustration outcome requires reconciliation before another provider request.",
    );
  }
  try {
    const b = await generate();
    const saved = await admin.storage
      .from(DNA_BUCKET)
      .upload(path, b, { contentType: "image/png", upsert: false });
    if (saved.error) throw new Error("Illustration needs reconciliation.");
    const marked = await usage
      .update({ status: "stored" })
      .eq("tile_id", job.id);
    if (marked.error) throw new Error("Illustration needs reconciliation.");
    return b;
  } catch (err) {
    await usage
      .update({ status: "uncertain" })
      .eq("tile_id", job.id)
      .eq("status", "reserved");
    throw err;
  }
}
async function processDnaJob(admin: Admin, type: "run" | "tile", job: Job) {
  const db = dnaDb(admin),
    ws = job.workspace_id;
  try {
    if (type === "run") {
      const progress = async (phase: string) => {
        const saved = await db
          .from("brand_dna_runs")
          .update({
            phase: phase.slice(0, 180),
            lease_until: new Date(Date.now() + 480000).toISOString(),
          })
          .eq("id", job.id)
          .eq("token", job.token)
          .eq("status", "running")
          .select("id")
          .maybeSingle();
        if (saved.error || !saved.data) throw new Error("Analysis superseded.");
      };
      const save = (bytes: Buffer, mime: string, name: string) =>
        saveDnaBytes(admin, ws, bytes, mime, name);
      await progress(
        job.source_kind === "package"
          ? "Verifying the reference package"
          : "Studying your website",
      );
      const dna =
        job.source_kind === "package"
          ? await (
              await import("./brand-dna-package.server")
            ).importDnaPackage(await readImport(admin, ws, job.source), save)
          : await (
              await import("./brand-dna-website.server")
            ).extractWebsiteDna(
              publicBrandWebsite(job.source) ?? job.source,
              save,
              progress,
            );
      if (
        !dna.name ||
        !(
          dna.colours.length ||
          dna.fonts.length ||
          dna.assets.length ||
          dna.messages.length
        )
      )
        throw new Error(
          "There was insufficient source evidence to build an identity.",
        );
      await progress("Saving the brand book");
      const enriched = await (
        await import("./brand-dna-fonts.server")
      ).enrichDnaFonts(dna, save);
      await storeDnaVersion(admin, ws, enriched, job);
    } else {
      const v = await dnaVersion(admin, ws, job.version_id);
      const { renderDnaTile } = await import("./brand-dna-production.server");
      const notes = new Set<string>();
      const b = await renderDnaTile(
        v.dna,
        job.kind,
        (path) => readDnaBytes(admin, ws, path),
        ws,
        process.env["OPENAI_API_KEY"]?.trim()
          ? (generate) => illustrativeArtwork(admin, job, generate)
          : undefined,
        (note) => notes.add(note),
      );
      const path = await saveDnaBytes(
        admin,
        ws,
        b,
        "image/png",
        job.kind + ".png",
      );
      const recorded = await db
        .from("brand_dna_tiles")
        .update({
          status: "ready",
          path,
          notes: [...notes],
          error: null,
          token: null,
          lease_until: null,
        })
        .eq("id", job.id)
        .eq("token", job.token);
      if (recorded.error)
        throw new Error("Could not record the showcase graphic.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Provider payloads, URLs and infrastructure details do not belong in customer status.
    const known = [
      /package upload is incomplete/i,
      /insufficient source evidence/i,
      /illustration outcome requires reconciliation/i,
      /font.*unavailable/i,
      /website.*(blocked|unavailable)/i,
    ].find((p) => p.test(message));
    const detail = known
      ? message.slice(0, 180)
      : type === "run"
        ? "Could not complete the analysis. Check the website or package and rebuild DNA."
        : "This example could not be finished. Retry it from Creative Showcase.";
    const result = await db
      .from(type === "run" ? "brand_dna_runs" : "brand_dna_tiles")
      .update({
        status: "failed",
        error: detail,
        token: null,
        lease_until: null,
        ...(type === "run" ? { phase: "Analysis interrupted" } : {}),
      })
      .eq("id", job.id)
      .eq("token", job.token);
    if (result.error)
      throw new Error("Could not record the interrupted Brand DNA job.");
  }
}
export async function advanceDnaJobs(workspaceId?: string) {
  const admin = getAdminClient();
  const take = async (preferTile: boolean) => {
    const { data, error } = await dnaDb(admin).rpc("claim_brand_dna", {
      p_workspace: workspaceId ?? null,
      p_prefer_tile: preferTile,
    });
    if (error) throw new Error("Could not claim Brand DNA work.");
    if (!data) return 0;
    await processDnaJob(admin, data.type, data.job);
    return 1;
  };
  const finished = await Promise.all([take(false), take(true), take(true)]);
  return { updated: finished.reduce<number>((count, n) => count + n, 0) };
}
export function wakeDnaWorker(ws: string) {
  waitUntil(
    advanceDnaJobs(ws).catch(() =>
      console.warn("Brand DNA will resume on the workspace worker."),
    ),
  );
}
