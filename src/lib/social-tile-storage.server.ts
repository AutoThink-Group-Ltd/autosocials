import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { getAdminClient } from "./supabase-admin.server";
import { inspectCreativeMediaBytes } from "./creative-media.server";
import type { SaveTilesInput, TileDraftsInput } from "./social-tile-storage";

type Admin = ReturnType<typeof getAdminClient>;
type ItemResult =
  { id: string; ok: true } | { id: string; ok: false; error: string };
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export function decodeTilePng(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid PNG encoding.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value)
    throw new Error("Invalid PNG encoding.");
  if (bytes.length > 3_000_000 || bytes.length < 45)
    throw new Error("Tile image must be under 3 MB.");
  const image = inspectCreativeMediaBytes(bytes, "image");
  if (
    image.contentType !== "image/png" ||
    bytes.readUInt32BE(16) !== 1000 ||
    ![1000, 1250].includes(bytes.readUInt32BE(20))
  )
    throw new Error("Tile must be a 1000 × 1000 or 1000 × 1250 PNG.");
  // Browser canvas exports are non-interlaced, 8-bit RGB or RGBA PNGs.
  // Bound decompression and verify complete scanlines before storage.
  const colour = bytes[25];
  if (
    bytes[24] !== 8 ||
    (colour !== 2 && colour !== 6) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] !== 0
  )
    throw new Error("This PNG format is not supported. Export the tile again.");
  const idat: Buffer[] = [];
  let offset = 8,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12)
      throw new Error("The PNG is incomplete.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      idat.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
    if (type === "IEND") {
      ended = size === 0 && offset === bytes.length;
      break;
    }
  }
  const height = bytes.readUInt32BE(20);
  const stride = 1000 * (colour === 6 ? 4 : 3) + 1;
  if (!ended || !idat.length) throw new Error("The PNG is incomplete.");
  try {
    const pixels = inflateSync(Buffer.concat(idat), {
      maxOutputLength: stride * height,
    });
    if (pixels.length !== stride * height) throw new Error("Incomplete pixels");
    for (let row = 0; row < height; row++)
      if (pixels[row * stride]! > 4) throw new Error("Invalid PNG filter");
  } catch {
    throw new Error("The PNG image could not be decoded.");
  }
  return bytes;
}

export function decodeTileImage(
  value: string,
  mime: "image/png" | "image/jpeg",
): Buffer {
  if (mime === "image/png") return decodeTilePng(value);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid JPEG encoding.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value)
    throw new Error("Invalid JPEG encoding.");
  if (bytes.length > 3_000_000 || bytes.length < 4)
    throw new Error("Tile image must be under 3 MB.");
  try {
    if (inspectCreativeMediaBytes(bytes, "image").contentType !== mime)
      throw new Error("Wrong image type");
    const image = jpeg.decode(bytes, {
      useTArray: true,
      tolerantDecoding: false,
      maxResolutionInMP: 1.25,
      maxMemoryUsageInMB: 64,
    });
    if (image.width !== 1000 || ![1000, 1250].includes(image.height))
      throw new Error("Wrong dimensions");
  } catch {
    throw new Error("Tile must be a valid 1000 × 1000 or 1000 × 1250 JPEG.");
  }
  return bytes;
}

/** Convert a validated tile to a deterministic JPEG for providers that require JPEG.
 * Transparent pixels are composited onto white; image dimensions and framing are retained. */
export function tilePngToJpeg(bytes: Buffer): Buffer {
  decodeTilePng(bytes.toString("base64"));
  const channels = bytes[25] === 6 ? 4 : 3;
  const height = bytes.readUInt32BE(20);
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") parts.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const rowBytes = 1000 * channels;
  const raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (rowBytes + 1) * height });
  const rgba = Buffer.alloc(1000 * height * 4);
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    const filter = raw[offset]!;
    const row = Buffer.allocUnsafe(rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? row[x - channels]! : 0;
      const above = previous[x]!;
      const upperLeft = x >= channels ? previous[x - channels]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      }
      row[x] = (raw[offset + 1 + x]! + predictor) & 255;
    }
    for (let x = 0; x < 1000; x++) {
      const src = x * channels, dest = (y * 1000 + x) * 4;
      const alpha = channels === 4 ? row[src + 3]! : 255;
      for (let c = 0; c < 3; c++) rgba[dest + c] = Math.round((row[src + c]! * alpha + 255 * (255 - alpha)) / 255);
      rgba[dest + 3] = 255;
    }
    previous = row;
  }
  return Buffer.from(jpeg.encode({ width: 1000, height, data: rgba }, 95).data);
}
async function member(admin: Admin, userId: string, workspaceId: string) {
  const { data, error } = await admin.rpc("can_access_workspace", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });
  if (error || !data) throw new Error("Workspace access denied.");
}
/** Creates an immutable object; a retry must carry the identical bytes. */
async function uploadOnce(
  admin: Admin,
  bucket: string,
  path: string,
  bytes: Buffer,
  mime: "image/png" | "image/jpeg",
) {
  const store = admin.storage.from(bucket);
  const uploaded = await store.upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (!uploaded.error) return;
  const existing = await store.download(path);
  if (
    existing.error ||
    !existing.data ||
    hash(Buffer.from(await existing.data.arrayBuffer())) !== hash(bytes)
  )
    throw new Error(
      "Image could not be stored safely. Retry with the original tile.",
    );
}

export async function saveTilesForUser(
  userId: string,
  data: SaveTilesInput,
): Promise<{ results: ItemResult[] }> {
  const admin = getAdminClient();
  await member(admin, userId, data.workspace_id);
  const results: ItemResult[] = [];
  for (const tile of data.tiles) {
    try {
      const bytes = decodeTileImage(tile.image_base64, tile.mime),
        digest = hash(bytes);
      const height = tile.mime === "image/png" ? bytes.readUInt32BE(20) : jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 1.25, maxMemoryUsageInMB: 64 }).height;
      const extension = tile.mime === "image/png" ? "png" : "jpg";
      const path = `${data.workspace_id}/social-tiles/${tile.id}.${extension}`;
      const { data: prior, error: lookupError } = await admin
        .from("brand_files")
        .select("id,workspace_id,created_by,storage_path,source,content_hash")
        .eq("id", tile.id)
        .maybeSingle();
      if (lookupError) throw new Error("Could not check this tile.");
      if (
        prior &&
        (prior.workspace_id !== data.workspace_id ||
          prior.created_by !== userId ||
          prior.storage_path !== path ||
          prior.source !== "social_tile" ||
          prior.content_hash !== digest)
      )
        throw new Error("Tile ID already belongs to different content.");
      await uploadOnce(admin, "brand-assets-private", path, bytes, tile.mime);
      if (!prior) {
        const { error } = await admin.from("brand_files").insert({
          id: tile.id,
          workspace_id: data.workspace_id,
          created_by: userId,
          name: `${tile.headline}.${extension}`,
          kind: "image",
          mime: tile.mime,
          width: 1000,
          height,
          size_bytes: bytes.length,
          storage_path: path,
          source: "social_tile",
          content_hash: digest,
          ai_label: "Social tile",
        });
        if (error)
          throw new Error(
            "Image was stored but its asset record could not be saved. Retry this same set.",
          );
      }
      results.push({ id: tile.id, ok: true });
    } catch (e) {
      results.push({
        id: tile.id,
        ok: false,
        error: e instanceof Error ? e.message : "Could not save tile.",
      });
    }
  }
  return { results };
}

function isSavedTilePath(path: string, workspaceId: string, fileId: string, mime: string) {
  const [workspace, folder, filename, ...extra] = path.split("/");
  const uploadFolder = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return workspace === workspaceId && extra.length === 0 &&
    (folder === "social-tiles" || uploadFolder.test(folder ?? "")) &&
    filename === `${fileId}.${mime === "image/png" ? "png" : "jpg"}`;
}

export async function createTileDraftsForUser(
  userId: string,
  data: TileDraftsInput,
  options: { providerCompatibleJpeg?: boolean } = {},
): Promise<{ results: ItemResult[] }> {
  const admin = getAdminClient();
  await member(admin, userId, data.workspace_id);
  const results: ItemResult[] = [];
  for (const tile of data.tiles) {
    try {
      const { data: file, error: fileError } = await admin
        .from("brand_files")
        .select(
          "id,workspace_id,storage_path,source,mime,width,height,content_hash",
        )
        .eq("id", tile.file_id)
        .eq("workspace_id", data.workspace_id)
        .maybeSingle();
      if (
        fileError ||
        !file ||
        file.source !== "social_tile" ||
        (file.mime !== "image/png" && file.mime !== "image/jpeg") ||
        file.width !== 1000 ||
        (file.height !== 1000 && file.height !== 1250) ||
        !isSavedTilePath(file.storage_path, data.workspace_id, tile.file_id, file.mime)
      )
        throw new Error("Saved tile not found in this workspace.");
      const { data: prior, error: postLookupError } = await admin
        .from("posts")
        .select("id,workspace_id,created_by,created_via,status,caption")
        .eq("id", tile.post_id)
        .maybeSingle();
      if (postLookupError) throw new Error("Could not check this draft.");
      const source = `social_tile:${tile.file_id}`;
      if (
        prior &&
        (prior.workspace_id !== data.workspace_id ||
          prior.created_by !== userId ||
          prior.created_via !== source)
      )
        throw new Error("Draft ID already belongs to different content.");
      const outputMime = options.providerCompatibleJpeg ? "image/jpeg" : file.mime;
      const mediaPath = `${data.workspace_id}/social-tiles/${tile.post_id}.${outputMime === "image/png" ? "png" : "jpg"}`;
      const { data: existingMedia, error: mediaLookupError } = await admin
        .from("post_media")
        .select("id,post_id,storage_path,kind")
        .eq("id", tile.post_id)
        .maybeSingle();
      if (mediaLookupError) throw new Error("Could not check draft media.");
      if (
        existingMedia &&
        (existingMedia.post_id !== tile.post_id ||
          existingMedia.storage_path !== mediaPath ||
          existingMedia.kind !== "image")
      )
        throw new Error("Draft media ID is already in use.");
      if (prior && existingMedia) {
        results.push({ id: tile.post_id, ok: true });
        continue;
      }
      if (prior && prior.status !== "draft")
        throw new Error(
          "The existing post is no longer a draft; inspect it before retrying.",
        );
      const downloaded = await admin.storage
        .from("brand-assets-private")
        .download(file.storage_path);
      if (downloaded.error || !downloaded.data)
        throw new Error("Saved tile image is unavailable.");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      decodeTileImage(bytes.toString("base64"), file.mime);
      if (!file.content_hash || hash(bytes) !== file.content_hash)
        throw new Error("Saved tile image did not match its asset record.");
      const output = options.providerCompatibleJpeg && file.mime === "image/png" ? tilePngToJpeg(bytes) : bytes;
      await uploadOnce(admin, "post-media", mediaPath, output, outputMime);
      if (!prior) {
        const inserted = await admin
          .from("posts")
          .insert({
            id: tile.post_id,
            workspace_id: data.workspace_id,
            created_by: userId,
            created_via: source,
            caption: tile.caption,
            status: "draft",
            post_type: "feed",
          })
          .select("id")
          .single();
        if (inserted.error)
          throw new Error(
            "Could not create the draft. Retry this same request.",
          );
      }
      if (!existingMedia) {
        const inserted = await admin.from("post_media").insert({
          id: tile.post_id,
          post_id: tile.post_id,
          storage_path: mediaPath,
          kind: "image",
          mime: outputMime,
          width: 1000,
          height: file.height,
          position: 0,
        });
        if (inserted.error)
          throw new Error(
            "Draft was created without media. Retry this same request to finish it.",
          );
      }
      results.push({ id: tile.post_id, ok: true });
    } catch (e) {
      results.push({
        id: tile.post_id,
        ok: false,
        error: e instanceof Error ? e.message : "Could not create draft.",
      });
    }
  }
  return { results };
}
