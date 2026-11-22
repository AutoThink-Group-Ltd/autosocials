import { createHash, randomUUID } from "node:crypto";
import { downloadCreativeMedia } from "./creative-media.server";
import { imageHeader } from "./film-qa";
import { getAdminClient } from "./supabase-admin.server";
import { runBrandOperation } from "./brand-assets.functions";
import { websiteImageCandidates } from "./website-image-candidates";

type Admin = ReturnType<typeof getAdminClient>;
/** Save a bounded, deduplicated selection of actual website images as private, reviewable brand files. */
export async function importWebsiteImages(admin: Admin, workspaceId: string, userId: string) {
  const workspace = await admin.from("workspaces").select("website").eq("id", workspaceId).maybeSingle();
  if (workspace.error || !workspace.data?.website) throw new Error("Add a website to the workspace first.");
  let website: string;
  try { const url = new URL(/^https?:\/\//i.test(workspace.data.website) ? workspace.data.website : `https://${workspace.data.website}`); if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error(); website = url.href; } catch { throw new Error("A public HTTPS website is needed."); }
  const scans = await admin.from("brand_files").select("extracted_text").eq("workspace_id", workspaceId).in("source", ["scan", "auto-scan"]).order("created_at", { ascending: false }).limit(20);
  if (scans.error) throw new Error("Could not read website scans.");
  const candidates = websiteImageCandidates(scans.data ?? [], website);
  if (!candidates.length) return { imported: 0, skipped: 0, found: 0, busy: false };
  const work = await runBrandOperation(admin, workspaceId, "website-images", { version: 2, website, urls: candidates.map((c) => c.url) }, async () => {
    const files = await admin.from("brand_files").select("content_hash,extracted_text,source").eq("workspace_id", workspaceId).eq("kind", "image");
    if (files.error) throw new Error("Could not check existing images.");
    const hashes = new Set((files.data ?? []).map((file) => file.content_hash).filter(Boolean));
    const existingSources = new Set((files.data ?? []).flatMap((file) => file.extracted_text?.match(/^Image source: (.+)$/m)?.[1] || []));
    let folder = await admin.from("asset_folders").select("id").eq("workspace_id", workspaceId).is("parent_id", null).eq("name", "Website").maybeSingle();
    if (folder.error) throw new Error("Could not find the Website folder.");
    if (!folder.data) folder = await admin.from("asset_folders").insert({ workspace_id: workspaceId, parent_id: null, name: "Website", is_system: true, created_by: userId }).select("id").single();
    if (folder.error || !folder.data) throw new Error("Could not create the Website folder.");
    const limit = Math.max(0, 24 - (files.data ?? []).filter((file) => file.source === "website-image").length);
    let imported = 0, skipped = 0;
    for (let offset = 0; offset < candidates.length && imported < limit; offset += 4) {
      const batch = candidates.slice(offset, offset + 4).filter((candidate) => !existingSources.has(candidate.url));
      const downloads = await Promise.allSettled(batch.map((candidate) => downloadCreativeMedia(candidate.url, { expected: "image", maxBytes: 8 * 1024 * 1024 })));
      for (let i = 0; i < batch.length; i++) {
        const candidate = batch[i]!; const downloaded = downloads[i]!;
        if (downloaded.status !== "fulfilled" || imported >= limit) { skipped++; continue; }
        const image = downloaded.value;
        const bytes = image.bytes;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const dimensions = imageHeader(buffer);
        if (!dimensions || dimensions.width < 400 || dimensions.height < 200 || dimensions.width * dimensions.height < 160000) { skipped++; continue; }
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hashes.has(hash)) { skipped++; continue; }
        const id = randomUUID(); const name = `${candidate.label.replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").trim().slice(0, 90) || "Website image"}.${image.extension}`;
        const path = `${workspaceId}/website-images/${id}.${image.extension}`;
        const upload = await admin.storage.from("brand-assets-private").upload(path, bytes, { contentType: image.contentType, upsert: false });
        if (upload.error) { skipped++; continue; }
        const saved = await admin.from("brand_files").insert({ id, workspace_id: workspaceId, folder_id: folder.data.id, name, kind: "image", mime: image.contentType, size_bytes: bytes.byteLength, storage_path: path, source: "website-image", content_hash: hash, width: dimensions.width, height: dimensions.height, has_alpha: dimensions.hasAlpha, ai_label: "Website image", ai_summary: `Found on ${new URL(candidate.page).hostname}: ${candidate.label}. Review before use.`, extracted_text: `Source: ${candidate.page}\nImage source: ${candidate.url}\nWebsite image, automatically collected for review.`, created_by: userId });
        if (saved.error) { await admin.storage.from("brand-assets-private").remove([path]); skipped++; continue; }
        hashes.add(hash); existingSources.add(candidate.url); imported++;
      }
    }
    return { imported, skipped, found: candidates.length };
  });
  return { ...(work.result ?? { imported: 0, skipped: 0, found: candidates.length }), busy: work.busy };
}
